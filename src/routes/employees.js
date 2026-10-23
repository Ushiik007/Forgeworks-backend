const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/employees — admin & manager only
router.get('/', authorize('admin', 'manager'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.*, a.status AS today_status
    FROM employees e
    LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = CURRENT_DATE
    ORDER BY e.name
  `);
  res.json(rows);
});

// POST /api/employees — admin only, add a new worker profile
router.post('/', authorize('admin'), async (req, res) => {
  const { name, role, shift } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'name and role are required' });
  const { rows } = await pool.query(
    'INSERT INTO employees (name, role, shift) VALUES ($1,$2,$3) RETURNING *',
    [name, role, shift || 'Day']
  );
  res.status(201).json(rows[0]);
});

// POST /api/employees/clock-in — the logged-in worker clocks themselves in
router.post('/clock-in', authorize('employee'), async (req, res) => {
  const employeeId = req.user.employeeId;
  if (!employeeId) return res.status(400).json({ error: 'This account is not linked to an employee profile' });
  const { rows } = await pool.query(
    `INSERT INTO attendance (employee_id, date, status, clock_in)
     VALUES ($1, CURRENT_DATE, 'present', CURRENT_TIME)
     ON CONFLICT (employee_id, date) DO UPDATE SET status='present', clock_in=CURRENT_TIME
     RETURNING *`,
    [employeeId]
  );
  res.json(rows[0]);
});

// POST /api/employees/clock-out
router.post('/clock-out', authorize('employee'), async (req, res) => {
  const employeeId = req.user.employeeId;
  const { rows } = await pool.query(
    `UPDATE attendance SET clock_out = CURRENT_TIME WHERE employee_id = $1 AND date = CURRENT_DATE RETURNING *`,
    [employeeId]
  );
  if (!rows[0]) return res.status(400).json({ error: 'You have not clocked in today' });
  res.json(rows[0]);
});

// GET /api/employees/me/attendance — a worker's own attendance history
router.get('/me/attendance', authorize('employee'), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM attendance WHERE employee_id = $1 ORDER BY date DESC',
    [req.user.employeeId]
  );
  res.json(rows);
});

module.exports = router;
