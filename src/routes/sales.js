const router = require('express').Router();
const { pool } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { isText, toPositive, paging, IST_DATE } = require('../utils/validate');
const { parseItems } = require('../utils/invoice');

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

router.use(authenticate, authorize('admin', 'manager'));

// GET /api/sales?limit=&offset=
router.get('/', async (req, res) => {
  const { limit, offset } = paging(req.query);
  const { rows } = await pool.query('SELECT * FROM sales ORDER BY date DESC, id DESC LIMIT $1 OFFSET $2', [limit, offset]);
  res.json(rows);
});

// GET /api/sales/:id — one invoice with its line items
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  const { rows: items } = await pool.query('SELECT * FROM sales_items WHERE sale_id = $1 ORDER BY id', [req.params.id]);
  res.json({ ...rows[0], items });
});

// POST /api/sales — admin creates an invoice.
//  New style: { customer, customerGstin?, code?, items: [{ description, qty, rate, gstRate?, inventoryId? }] }
//    -> totals and GST are calculated on the server, code is auto-generated (INV-1001...) if omitted,
//       and any line with inventoryId deducts that stock (rejected if there isn't enough).
//  Old style still works: { code, customer, amount }
router.post('/', authorize('admin'), async (req, res) => {
  const { code, customer, customerGstin, amount, items } = req.body;
  if (!isText(customer)) return res.status(400).json({ error: 'customer is required' });
  if (code !== undefined && code !== null && code !== '' && !isText(code, 1, 50)) {
    return res.status(400).json({ error: 'code must be 1 to 50 characters' });
  }
  let gstin = null;
  if (customerGstin) {
    gstin = String(customerGstin).trim().toUpperCase();
    if (!GSTIN_RE.test(gstin)) return res.status(400).json({ error: 'customerGstin is not a valid GSTIN' });
  }

  let lines = [];
  let subtotal;
  let gst = 0;
  let total;
  if (items !== undefined) {
    const parsed = parseItems(items);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    ({ lines, subtotal, gst, total } = parsed);
  } else {
    const amt = toPositive(amount);
    if (amt === null) return res.status(400).json({ error: 'Provide items, or a positive amount' });
    subtotal = amt;
    total = amt;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO sales (code, customer, customer_gstin, amount, subtotal, gst_amount, date)
       VALUES (COALESCE($1::text, 'INV-' || nextval('invoice_seq')), $2, $3, $4, $5, $6, ${IST_DATE})
       RETURNING *`,
      [code ? code.trim() : null, customer.trim(), gstin, total, subtotal, gst]
    );
    const sale = rows[0];
    const saved = [];
    for (const l of lines) {
      const { rows: it } = await client.query(
        `INSERT INTO sales_items (sale_id, inventory_id, description, qty, rate, gst_rate)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [sale.id, l.inventoryId, l.description, l.qty, l.rate, l.gstRate]
      );
      saved.push(it[0]);
      if (l.inventoryId !== null) {
        const dec = await client.query(
          'UPDATE inventory SET qty = qty - $1 WHERE id = $2 AND qty >= $1 RETURNING id',
          [l.qty, l.inventoryId]
        );
        if (!dec.rowCount) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `Stock item ${l.inventoryId} not found or not enough stock for "${l.description}"` });
        }
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ ...sale, items: saved });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err; // duplicate code -> 409 from the central error handler
  } finally {
    client.release();
  }
});

// PATCH /api/sales/:id/mark-paid
router.patch('/:id/mark-paid', authorize('admin'), async (req, res) => {
  const { rows } = await pool.query(`UPDATE sales SET status = 'Paid' WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  res.json(rows[0]);
});

// DELETE /api/sales/:id — admin: only unpaid invoices; stock deducted by the invoice is put back
router.delete('/:id', authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT status FROM sales WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Invoice not found' }); }
    if (rows[0].status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only unpaid invoices can be deleted' });
    }
    await client.query(
      `UPDATE inventory i SET qty = i.qty + s.total
       FROM (SELECT inventory_id, SUM(qty) AS total FROM sales_items
             WHERE sale_id = $1 AND inventory_id IS NOT NULL GROUP BY inventory_id) s
       WHERE i.id = s.inventory_id`,
      [req.params.id]
    );
    await client.query('DELETE FROM sales WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Invoice deleted and stock restored' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
