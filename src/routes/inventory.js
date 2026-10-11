const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate); // every route below requires a logged-in user

// GET /api/inventory — everyone can view stock
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM inventory ORDER BY name');
  res.json(rows);
});

// POST /api/inventory — admin only, add a new material
router.post('/', authorize('admin'), async (req, res) => {
  const { name, category, qty, unit, threshold, supplier } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await pool.query(
    `INSERT INTO inventory (name, category, qty, unit, threshold, supplier)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, category || 'Misc', qty || 0, unit || 'pcs', threshold || 0, supplier || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/inventory/:id/restock — admin only, add stock (body: { amount })
router.patch('/:id/restock', authorize('admin'), async (req, res) => {
  const amount = Number(req.body.amount) || 10;
  const { rows } = await pool.query(
    'UPDATE inventory SET qty = qty + $1 WHERE id = $2 RETURNING *',
    [amount, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
  res.json(rows[0]);
});

// GET /api/inventory/low-stock — items at or below their reorder threshold
router.get('/low-stock', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM inventory WHERE qty <= threshold ORDER BY qty ASC');
  res.json(rows);
});

module.exports = router;
