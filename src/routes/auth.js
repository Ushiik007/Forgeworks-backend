const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, role: user.role, employeeId: user.employee_id },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, role: user.role, employeeId: user.employee_id }
  });
});

// GET /api/auth/me — returns the logged-in user, useful for the frontend on page load
router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

// POST /api/auth/register — admin only, creates Admin/Manager/Worker logins
router.post('/register', authenticate, authorize('admin'), async (req, res) => {
  const { name, email, password, role, employeeId } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password and role are required' });
  }
  if (!['admin', 'manager', 'employee'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, manager or employee' });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, employee_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, employee_id`,
      [name, email.toLowerCase(), hash, role, employeeId || null]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That email is already registered' });
    throw err;
  }
});

module.exports = router;
