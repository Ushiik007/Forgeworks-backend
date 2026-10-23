const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

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

// POST /api/leaves — a worker requests time off
router.post('/', authorize('employee'), async (req, res) => {
  const { from, to, reason } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });
  const { rows } = await pool.query(
    'INSERT INTO leaves (employee_id, from_date, to_date, reason) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.employeeId, from, to, reason || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/leaves/:id — admin/manager approves or rejects (body: { status })
router.patch('/:id', authorize('admin', 'manager'), async (req, res) => {
  const { status } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be Approved or Rejected' });
  }
  const { rows } = await pool.query('UPDATE leaves SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Leave request not found' });
  res.json(rows[0]);
});

// GET /api/leaves/pending — quick count for the notification bell
router.get('/pending', authorize('admin', 'manager'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT l.*, e.name AS employee_name FROM leaves l
    JOIN employees e ON e.id = l.employee_id
    WHERE l.status = 'Pending' ORDER BY l.id DESC
  `);
  res.json(rows);
});

module.exports = router;
