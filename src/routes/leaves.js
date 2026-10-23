const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { isDate } = require('../utils/validate');

router.use(authenticate);

// GET /api/leaves — admin/manager see everyone's requests, worker sees only their own
router.get('/', async (req, res) => {
  if (req.user.role === 'employee') {
    const { rows } = await pool.query(
      'SELECT * FROM leaves WHERE employee_id = $1 ORDER BY id DESC',
      [req.user.employeeId]
    );
    return res.json(rows);
  }
  const { rows } = await pool.query(`
    SELECT l.*, e.name AS employee_name FROM leaves l
    JOIN employees e ON e.id = l.employee_id
    ORDER BY l.id DESC
  `);
  res.json(rows);
});

// POST /api/leaves — anyone linked to an employee profile (including managers) requests time off
router.post('/', async (req, res) => {
  if (!req.user.employeeId) {
    return res.status(400).json({ error: 'This account is not linked to an employee profile' });
  }
  const { from, to, reason } = req.body;
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'from and to must be dates (YYYY-MM-DD)' });
  if (from > to) return res.status(400).json({ error: 'The end date cannot be before the start date' });
  if (reason !== undefined && reason !== null && (typeof reason !== 'string' || reason.length > 500)) {
    return res.status(400).json({ error: 'reason must be text up to 500 characters' });
  }
  const { rows } = await pool.query(
    'INSERT INTO leaves (employee_id, from_date, to_date, reason) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.employeeId, from, to, reason || null]
  );
  res.status(201).json(rows[0]);
});

// GET /api/leaves/pending — quick list for the notification bell
router.get('/pending', authorize('admin', 'manager'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT l.*, e.name AS employee_name FROM leaves l
    JOIN employees e ON e.id = l.employee_id
    WHERE l.status = 'Pending' ORDER BY l.id DESC
  `);
  res.json(rows);
});

// PATCH /api/leaves/:id — approve/reject (body: { status }). Only pending requests; managers can't approve their own.
router.patch('/:id', authorize('admin', 'manager'), async (req, res) => {
  const { status } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be Approved or Rejected' });
  }
  const { rows: found } = await pool.query('SELECT * FROM leaves WHERE id = $1', [req.params.id]);
  const leave = found[0];
  if (!leave) return res.status(404).json({ error: 'Leave request not found' });
  if (leave.status !== 'Pending') return res.status(409).json({ error: 'This request has already been decided' });
  if (req.user.role === 'manager' && leave.employee_id === req.user.employeeId) {
    return res.status(403).json({ error: 'You cannot decide your own leave request. Ask an admin.' });
  }
  const { rows } = await pool.query('UPDATE leaves SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
  res.json(rows[0]);
});

module.exports = router;
