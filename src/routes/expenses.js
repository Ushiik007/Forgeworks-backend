const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('admin'));

// GET /api/expenses
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM expenses ORDER BY date DESC');
  res.json(rows);
});

// POST /api/expenses
router.post('/', async (req, res) => {
  const { description, amount, date } = req.body;
  if (!description || !amount) return res.status(400).json({ error: 'description and amount are required' });
  const { rows } = await pool.query(
    'INSERT INTO expenses (description, amount, date) VALUES ($1,$2,COALESCE($3, CURRENT_DATE)) RETURNING *',
    [description, amount, date || null]
  );
  res.status(201).json(rows[0]);
});

// GET /api/expenses/summary — quick profit & loss view for the Finance dashboard
router.get('/summary', async (req, res) => {
  const income = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM sales WHERE status = 'Paid'`);
  const spent = await pool.query('SELECT COALESCE(SUM(amount),0) AS total FROM expenses');
  const incomeTotal = Number(income.rows[0].total);
  const expenseTotal = Number(spent.rows[0].total);
  res.json({ income: incomeTotal, expenses: expenseTotal, netProfit: incomeTotal - expenseTotal });
});

module.exports = router;
