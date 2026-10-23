const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { isText, isDate, toPositive, paging, buildUpdate, IST_DATE } = require('../utils/validate');

router.use(authenticate, authorize('admin'));

// GET /api/expenses?limit=&offset=
router.get('/', async (req, res) => {
  const { limit, offset } = paging(req.query);
  const { rows } = await pool.query('SELECT * FROM expenses ORDER BY date DESC, id DESC LIMIT $1 OFFSET $2', [limit, offset]);
  res.json(rows);
});

// GET /api/expenses/summary — quick profit & loss view
router.get('/summary', async (req, res) => {
  const income = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM sales WHERE status = 'Paid'`);
  const spent = await pool.query('SELECT COALESCE(SUM(amount),0) AS total FROM expenses');
  const incomeTotal = Number(income.rows[0].total);
  const expenseTotal = Number(spent.rows[0].total);
  res.json({ income: incomeTotal, expenses: expenseTotal, netProfit: incomeTotal - expenseTotal });
});

// POST /api/expenses
router.post('/', async (req, res) => {
  const { description, amount, date } = req.body;
  const amt = toPositive(amount);
  if (!isText(description, 1, 300) || amt === null) {
    return res.status(400).json({ error: 'description and a positive amount are required' });
  }
  if (date && !isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  const { rows } = await pool.query(
    `INSERT INTO expenses (description, amount, date) VALUES ($1,$2,COALESCE($3::date, ${IST_DATE})) RETURNING *`,
    [description.trim(), amt, date || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/expenses/:id
router.patch('/:id', async (req, res) => {
  const { description, amount, date } = req.body;
  const f = {};
  if (description !== undefined) { if (!isText(description, 1, 300)) return res.status(400).json({ error: 'description cannot be empty' }); f.description = description.trim(); }
  if (amount !== undefined) { const a = toPositive(amount); if (a === null) return res.status(400).json({ error: 'amount must be greater than 0' }); f.amount = a; }
  if (date !== undefined) { if (!isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' }); f.date = date; }
  if (!Object.keys(f).length) return res.status(400).json({ error: 'Nothing to update' });
  const q = buildUpdate('expenses', f, req.params.id);
  const { rows } = await pool.query(q.text, q.values);
  if (!rows[0]) return res.status(404).json({ error: 'Expense not found' });
  res.json(rows[0]);
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Expense not found' });
  res.json({ message: 'Expense deleted' });
});

module.exports = router;
