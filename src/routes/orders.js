const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const STAGES = ['Cutting', 'Welding/Carpentry', 'Assembly', 'Polishing', 'Packing'];

router.use(authenticate);

// GET /api/orders
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders ORDER BY deadline ASC');
  res.json(rows.map(o => ({ ...o, stageName: STAGES[o.stage] })));
});

// POST /api/orders — admin only
router.post('/', authorize('admin'), async (req, res) => {
  const { code, customer, item, deadline } = req.body;
  if (!code || !customer || !item || !deadline) {
    return res.status(400).json({ error: 'code, customer, item and deadline are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO orders (code, customer, item, deadline) VALUES ($1,$2,$3,$4) RETURNING *`,
      [code, customer, item, deadline]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An order with that code already exists' });
    throw err;
  }
});

// PATCH /api/orders/:id/advance — admin or manager, moves to the next production stage
router.patch('/:id/advance', authorize('admin', 'manager'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  const order = rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.stage >= STAGES.length - 1) return res.status(400).json({ error: 'Order is already at the final stage' });

  const { rows: updated } = await pool.query(
    'UPDATE orders SET stage = stage + 1 WHERE id = $1 RETURNING *',
    [req.params.id]
  );
  res.json({ ...updated[0], stageName: STAGES[updated[0].stage] });
});

// GET /api/orders/overdue — orders past deadline and not yet complete
router.get('/overdue', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE deadline < CURRENT_DATE AND stage < $1 ORDER BY deadline ASC`,
    [STAGES.length - 1]
  );
  res.json(rows);
});

module.exports = router;
