const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { isText, isDate, toInt, buildUpdate, IST_DATE } = require('../utils/validate');
const { STAGES } = require('../utils/stages');

router.use(authenticate);

// GET /api/orders
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders ORDER BY deadline ASC');
  res.json(rows.map(o => ({ ...o, stageName: STAGES[o.stage] })));
});

// GET /api/orders/overdue — orders past deadline and not yet complete
router.get('/overdue', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE deadline < ${IST_DATE} AND stage < $1 ORDER BY deadline ASC`,
    [STAGES.length - 1]
  );
  res.json(rows.map(o => ({ ...o, stageName: STAGES[o.stage] })));
});

// POST /api/orders — admin only
router.post('/', authorize('admin'), async (req, res) => {
  const { code, customer, item, deadline } = req.body;
  if (!isText(code, 1, 50) || !isText(customer) || !isText(item) || !isDate(deadline)) {
    return res.status(400).json({ error: 'code, customer, item and a valid deadline (YYYY-MM-DD) are required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO orders (code, customer, item, deadline) VALUES ($1,$2,$3,$4) RETURNING *`,
    [code.trim(), customer.trim(), item.trim(), deadline]
  ); // duplicate code -> 409 from the central error handler
  res.status(201).json(rows[0]);
});

// PATCH /api/orders/:id — admin: edit details (or correct the stage)
router.patch('/:id', authorize('admin'), async (req, res) => {
  const { customer, item, deadline, stage } = req.body;
  const f = {};
  if (customer !== undefined) { if (!isText(customer)) return res.status(400).json({ error: 'customer cannot be empty' }); f.customer = customer.trim(); }
  if (item !== undefined) { if (!isText(item)) return res.status(400).json({ error: 'item cannot be empty' }); f.item = item.trim(); }
  if (deadline !== undefined) { if (!isDate(deadline)) return res.status(400).json({ error: 'deadline must be YYYY-MM-DD' }); f.deadline = deadline; }
  if (stage !== undefined) {
    const s = toInt(stage);
    if (s === null || s < 0 || s > STAGES.length - 1) return res.status(400).json({ error: `stage must be 0 to ${STAGES.length - 1}` });
    f.stage = s;
  }
  if (!Object.keys(f).length) return res.status(400).json({ error: 'Nothing to update' });
  const q = buildUpdate('orders', f, req.params.id);
  const { rows } = await pool.query(q.text, q.values);
  if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
  res.json({ ...rows[0], stageName: STAGES[rows[0].stage] });
});

// PATCH /api/orders/:id/advance — admin or manager, moves to the next production stage
router.patch('/:id/advance', authorize('admin', 'manager'), async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE orders SET stage = stage + 1 WHERE id = $1 AND stage < $2 RETURNING *',
    [req.params.id, STAGES.length - 1]
  );
  if (!rows[0]) {
    const { rows: exists } = await pool.query('SELECT 1 FROM orders WHERE id = $1', [req.params.id]);
    if (!exists[0]) return res.status(404).json({ error: 'Order not found' });
    return res.status(400).json({ error: 'Order is already at the final stage' });
  }
  res.json({ ...rows[0], stageName: STAGES[rows[0].stage] });
});

// DELETE /api/orders/:id — admin (tasks linked to it stay, just unlinked)
router.delete('/:id', authorize('admin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Order not found' });
  res.json({ message: 'Order deleted' });
});

module.exports = router;
