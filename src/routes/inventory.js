const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { isText, toPositive, toNonNegative, buildUpdate } = require('../utils/validate');

router.use(authenticate); // every route below requires a logged-in user

// GET /api/inventory — everyone can view stock
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM inventory ORDER BY name');
  res.json(rows);
});

// GET /api/inventory/low-stock
router.get('/low-stock', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM inventory WHERE qty <= threshold ORDER BY qty ASC');
  res.json(rows);
});

// POST /api/inventory — admin only, add a new material
router.post('/', authorize('admin'), async (req, res) => {
  const { name, category, qty, unit, threshold, supplier } = req.body;
  if (!isText(name)) return res.status(400).json({ error: 'name is required' });
  const q = qty === undefined ? 0 : toNonNegative(qty);
  const th = threshold === undefined ? 0 : toNonNegative(threshold);
  if (q === null || th === null) return res.status(400).json({ error: 'qty and threshold must be numbers (0 or more)' });
  const { rows } = await pool.query(
    `INSERT INTO inventory (name, category, qty, unit, threshold, supplier)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name.trim(), category || 'Misc', q, unit || 'pcs', th, supplier || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/inventory/:id — admin: edit details or correct the stock count
router.patch('/:id', authorize('admin'), async (req, res) => {
  const { name, category, unit, supplier, qty, threshold } = req.body;
  const f = {};
  if (name !== undefined) { if (!isText(name)) return res.status(400).json({ error: 'name cannot be empty' }); f.name = name.trim(); }
  if (category !== undefined) { if (!isText(category)) return res.status(400).json({ error: 'category cannot be empty' }); f.category = category.trim(); }
  if (unit !== undefined) { if (!isText(unit, 1, 20)) return res.status(400).json({ error: 'unit cannot be empty' }); f.unit = unit.trim(); }
  if (supplier !== undefined) { f.supplier = supplier ? String(supplier).trim() : null; }
  if (qty !== undefined) { const n = toNonNegative(qty); if (n === null) return res.status(400).json({ error: 'qty must be 0 or more' }); f.qty = n; }
  if (threshold !== undefined) { const n = toNonNegative(threshold); if (n === null) return res.status(400).json({ error: 'threshold must be 0 or more' }); f.threshold = n; }
  if (!Object.keys(f).length) return res.status(400).json({ error: 'Nothing to update' });
  const q = buildUpdate('inventory', f, req.params.id);
  const { rows } = await pool.query(q.text, q.values);
  if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
  res.json(rows[0]);
});

// PATCH /api/inventory/:id/restock — admin only (body: { amount }; defaults to 10 if omitted)
router.patch('/:id/restock', authorize('admin'), async (req, res) => {
  const amount = req.body.amount === undefined ? 10 : toPositive(req.body.amount);
  if (amount === null) return res.status(400).json({ error: 'amount must be a number greater than 0' });
  const { rows } = await pool.query('UPDATE inventory SET qty = qty + $1 WHERE id = $2 RETURNING *', [amount, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
  res.json(rows[0]);
});

// PATCH /api/inventory/:id/consume — admin/manager: use material in production (body: { amount })
router.patch('/:id/consume', authorize('admin', 'manager'), async (req, res) => {
  const amount = toPositive(req.body.amount);
  if (amount === null) return res.status(400).json({ error: 'amount must be a number greater than 0' });
  const { rows } = await pool.query(
    'UPDATE inventory SET qty = qty - $1 WHERE id = $2 AND qty >= $1 RETURNING *',
    [amount, req.params.id]
  );
  if (!rows[0]) {
    const { rows: ex } = await pool.query('SELECT 1 FROM inventory WHERE id = $1', [req.params.id]);
    return ex[0] ? res.status(409).json({ error: 'Not enough stock' }) : res.status(404).json({ error: 'Item not found' });
  }
  res.json(rows[0]);
});

// DELETE /api/inventory/:id — admin
router.delete('/:id', authorize('admin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM inventory WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Item not found' });
  res.json({ message: 'Item deleted' });
});

module.exports = router;
