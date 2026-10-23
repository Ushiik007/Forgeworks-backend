const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { isText, buildUpdate, IST_DATE, IST_TIME } = require('../utils/validate');

router.use(authenticate);

// Any logged-in user linked to an employee profile (workers AND managers) can use clock-in / own attendance
function requireEmployeeProfile(req, res, next) {
  if (!req.user.employeeId) {
    return res.status(400).json({ error: 'This account is not linked to an employee profile' });
  }
  next();
}

// GET /api/employees — admin & manager only
router.get('/', authorize('admin', 'manager'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.*, a.status AS today_status
    FROM employees e
    LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ${IST_DATE}
    ORDER BY e.name
  `);
  res.json(rows);
});

// POST /api/employees — admin only, add a new worker profile
router.post('/', authorize('admin'), async (req, res) => {
  const { name, role, shift } = req.body;
  if (!isText(name, 2) || !isText(role)) return res.status(400).json({ error: 'name and role are required' });
  if (shift !== undefined && !['Day', 'Night'].includes(shift)) {
    return res.status(400).json({ error: 'shift must be Day or Night' });
  }
  const { rows } = await pool.query(
    'INSERT INTO employees (name, role, shift) VALUES ($1,$2,$3) RETURNING *',
    [name.trim(), role.trim(), shift || 'Day']
  );
  res.status(201).json(rows[0]);
});

// POST /api/employees/clock-in — keeps the FIRST clock-in of the day (repeat clicks don't reset it)
router.post('/clock-in', requireEmployeeProfile, async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO attendance (employee_id, date, status, clock_in)
     VALUES ($1, ${IST_DATE}, 'present', ${IST_TIME})
     ON CONFLICT (employee_id, date)
     DO UPDATE SET status = 'present', clock_in = COALESCE(attendance.clock_in, EXCLUDED.clock_in)
     RETURNING *`,
    [req.user.employeeId]
  );
  res.json(rows[0]);
});

// POST /api/employees/clock-out
router.post('/clock-out', requireEmployeeProfile, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE attendance SET clock_out = ${IST_TIME}
     WHERE employee_id = $1 AND date = ${IST_DATE} AND clock_in IS NOT NULL RETURNING *`,
    [req.user.employeeId]
  );
  if (!rows[0]) return res.status(400).json({ error: 'You have not clocked in today' });
  res.json(rows[0]);
});

// GET /api/employees/me/attendance — own attendance history
router.get('/me/attendance', requireEmployeeProfile, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM attendance WHERE employee_id = $1 ORDER BY date DESC',
    [req.user.employeeId]
  );
  res.json(rows);
});

// PATCH /api/employees/:id — admin: edit a worker profile
router.patch('/:id', authorize('admin'), async (req, res) => {
  const { name, role, shift } = req.body;
  const f = {};
  if (name !== undefined) { if (!isText(name, 2)) return res.status(400).json({ error: 'name must be at least 2 characters' }); f.name = name.trim(); }
  if (role !== undefined) { if (!isText(role)) return res.status(400).json({ error: 'role cannot be empty' }); f.role = role.trim(); }
  if (shift !== undefined) { if (!['Day', 'Night'].includes(shift)) return res.status(400).json({ error: 'shift must be Day or Night' }); f.shift = shift; }
  if (!Object.keys(f).length) return res.status(400).json({ error: 'Nothing to update' });
  const q = buildUpdate('employees', f, req.params.id);
  const { rows } = await pool.query(q.text, q.values);
  if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
  res.json(rows[0]);
});

// DELETE /api/employees/:id — admin. Also removes their attendance, tasks and leave records.
router.delete('/:id', authorize('admin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Employee not found' });
  res.json({ message: 'Employee deleted' });
});

module.exports = router;
