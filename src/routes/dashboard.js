const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { IST_DATE } = require('../utils/validate');
const { STAGES } = require('../utils/stages');

router.use(authenticate, authorize('admin', 'manager'));

// GET /api/dashboard — one call with the numbers for the home screen
router.get('/', async (req, res) => {
  const last = STAGES.length - 1;
  const monthStart = `date_trunc('month', ${IST_DATE})::date`;
  const isAdmin = req.user.role === 'admin';

  const [stock, orders, invoices, staff, leaves, spend] = await Promise.all([
    pool.query('SELECT COUNT(*) AS n FROM inventory WHERE qty <= threshold'),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE stage < $1) AS active,
              COUNT(*) FILTER (WHERE stage < $1 AND deadline < ${IST_DATE}) AS overdue
       FROM orders`, [last]),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'Pending') AS pending_count,
              COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0) AS pending_total,
              COALESCE(SUM(amount) FILTER (WHERE status = 'Paid' AND date >= ${monthStart}), 0) AS paid_this_month
       FROM sales`),
    pool.query(
      `SELECT (SELECT COUNT(*) FROM employees) AS total,
              (SELECT COUNT(*) FROM attendance WHERE date = ${IST_DATE} AND status = 'present') AS present`),
    pool.query(`SELECT COUNT(*) AS n FROM leaves WHERE status = 'Pending'`),
    isAdmin
      ? pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= ${monthStart}`)
      : Promise.resolve(null),
  ]);

  res.json({
    lowStockItems: Number(stock.rows[0].n),
    activeOrders: Number(orders.rows[0].active),
    overdueOrders: Number(orders.rows[0].overdue),
    pendingInvoices: Number(invoices.rows[0].pending_count),
    pendingInvoiceAmount: Number(invoices.rows[0].pending_total),
    paidThisMonth: Number(invoices.rows[0].paid_this_month),
    employees: Number(staff.rows[0].total),
    presentToday: Number(staff.rows[0].present),
    pendingLeaves: Number(leaves.rows[0].n),
    ...(isAdmin ? { expensesThisMonth: Number(spend.rows[0].total) } : {}),
  });
});

module.exports = router;
