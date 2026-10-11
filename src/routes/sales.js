const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('admin', 'manager'));

// GET /api/sales
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM sales ORDER BY date DESC');
  res.json(rows);
});

// POST /api/sales — admin only creates invoices
router.post('/', authorize('admin'), async (req, res) => {
  const { code, customer, amount } = req.body;
  if (!code || !customer || !amount) return res.status(400).json({ error: 'code, customer and amount are required' });
  const { rows } = await pool.query(
    'INSERT INTO sales (code, customer, amount) VALUES ($1,$2,$3) RETURNING *',
    [code, customer, amount]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/sales/:id/mark-paid
router.patch('/:id/mark-paid', authorize('admin'), async (req, res) => {
  const { rows } = await pool.query(`UPDATE sales SET status = 'Paid' WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  res.json(rows[0]);
});

module.exports = router;
