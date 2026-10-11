const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/tasks — admin/manager see all, worker sees only their own
router.get('/', async (req, res) => {
  if (req.user.role === 'employee') {
    const { rows } = await pool.query(
      `SELECT t.*, o.code AS order_code FROM tasks t
       LEFT JOIN orders o ON o.id = t.order_id
       WHERE t.employee_id = $1 ORDER BY t.id DESC`,
      [req.user.employeeId]
    );
    return res.json(rows);
  }
  const { rows } = await pool.query(`
    SELECT t.*, e.name AS employee_name, o.code AS order_code
    FROM tasks t
    JOIN employees e ON e.id = t.employee_id
    LEFT JOIN orders o ON o.id = t.order_id
    ORDER BY t.id DESC
  `);
  res.json(rows);
});

// POST /api/tasks — admin or manager assigns a task
router.post('/', authorize('admin', 'manager'), async (req, res) => {
  const { employeeId, orderId, title } = req.body;
  if (!employeeId || !title) return res.status(400).json({ error: 'employeeId and title are required' });
  const { rows } = await pool.query(
    'INSERT INTO tasks (employee_id, order_id, title) VALUES ($1,$2,$3) RETURNING *',
    [employeeId, orderId || null, title]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/tasks/:id — worker updates status on their own task; admin/manager can update any
router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  if (!['Pending', 'In Progress', 'Done'].includes(status)) {
    return res.status(400).json({ error: 'status must be Pending, In Progress or Done' });
  }
  const { rows: existing } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  const task = existing[0];
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const isOwner = req.user.role === 'employee' && task.employee_id === req.user.employeeId;
  const isManagerOrAdmin = req.user.role === 'admin' || req.user.role === 'manager';
  if (!isOwner && !isManagerOrAdmin) return res.status(403).json({ error: 'You can only update your own tasks' });

  const { rows } = await pool.query('UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
  res.json(rows[0]);
});

module.exports = router;
