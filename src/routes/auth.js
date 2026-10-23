const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { isText, toInt } = require('../utils/validate');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'manager', 'employee'];

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, role: user.role, employeeId: user.employee_id },
    process.env.JWT_SECRET,
    { expiresIn: '12h', algorithm: 'HS256' }
  );
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email format' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = rows[0];
  // Same generic message for unknown email, wrong password and disabled accounts
  if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, role: user.role, employeeId: user.employee_id }
  });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

// POST /api/auth/change-password — any logged-in user changes their own password
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  if (newPassword === currentPassword) return res.status(400).json({ error: 'New password must be different' });

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const ok = rows[0] && (await bcrypt.compare(currentPassword, rows[0].password_hash));
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(newPassword, 10), req.user.id]);
  res.json({ message: 'Password changed' });
});

// POST /api/auth/register — admin only, creates Admin/Manager/Employee logins
router.post('/register', authenticate, authorize('admin'), async (req, res) => {
  const { name, email, password, role, employeeId } = req.body;
  if (![name, email, password, role].every(v => typeof v === 'string' && v)) {
    return res.status(400).json({ error: 'name, email, password and role are required' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'role must be admin, manager or employee' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email format' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (name.trim().length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters' });
  if (employeeId !== undefined && employeeId !== null && toInt(employeeId) === null) {
    return res.status(400).json({ error: 'employeeId must be a number' });
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, employee_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, employee_id`,
    [name.trim(), email.toLowerCase(), hash, role, employeeId || null]
  ); // duplicate email -> 409 from the central error handler
  res.status(201).json({ user: rows[0] });
});

// GET /api/auth/users — admin: list all logins
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.employee_id, u.is_active, u.created_at
     FROM users u ORDER BY u.id`
  );
  res.json(rows);
});

// PATCH /api/auth/users/:id — admin: enable/disable a login or change its role (not your own)
router.patch('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid user id' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot change your own account here' });
  const { isActive, role } = req.body;
  const fields = {};
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false' });
    fields.is_active = isActive;
  }
  if (role !== undefined) {
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'role must be admin, manager or employee' });
    fields.role = role;
  }
  const keys = Object.keys(fields);
  if (!keys.length) return res.status(400).json({ error: 'Nothing to update' });
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `UPDATE users SET ${sets} WHERE id = $${keys.length + 1} RETURNING id, name, email, role, employee_id, is_active`,
    [...keys.map(k => fields[k]), id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

// POST /api/auth/users/:id/reset-password — admin sets a new password for someone who forgot theirs
router.post('/users/:id/reset-password', authenticate, authorize('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  const { newPassword } = req.body;
  if (id === null) return res.status(400).json({ error: 'Invalid user id' });
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
  }
  const { rowCount } = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(newPassword, 10), id]);
  if (!rowCount) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'Password reset' });
});

module.exports = router;
