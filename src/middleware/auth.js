const jwt = require('jsonwebtoken');
const { pool } = require('../db');

// Verifies the token, then re-checks the user in the database, so disabled users are blocked
// immediately and role changes apply right away. Attaches { id, name, role, employeeId } to req.user.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing or invalid Authorization header' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { rows } = await pool.query(
    'SELECT id, name, role, employee_id, is_active FROM users WHERE id = $1',
    [payload.id]
  );
  const user = rows[0];
  if (!user || !user.is_active) return res.status(401).json({ error: 'Account disabled or removed' });

  req.user = { id: user.id, name: user.name, role: user.role, employeeId: user.employee_id };
  next();
}

// Usage: authorize('admin', 'manager')
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
