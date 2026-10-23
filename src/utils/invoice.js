const { isText, toPositive, toNonNegative, toInt } = require('./validate');

const ITEM_ERR = 'Each item needs description, qty > 0, rate >= 0, optional gstRate (0-100) and optional inventoryId';

// Validates line items and works out subtotal, GST and total in whole paise (no floating-point drift)
function parseItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return { error: 'items must be a list of 1 to 100 line items' };
  }
  const lines = [];
  let subtotalPaise = 0;
  let gstPaise = 0;
  for (const it of items) {
    if (!it || typeof it !== 'object') return { error: ITEM_ERR };
    const qty = toPositive(it.qty);
    const rate = toNonNegative(it.rate);
    const gstRate = it.gstRate === undefined ? 0 : toNonNegative(it.gstRate);
    const hasInv = it.inventoryId !== undefined && it.inventoryId !== null;
    const inventoryId = hasInv ? toInt(it.inventoryId) : null;
    if (!isText(it.description, 1, 200) || qty === null || rate === null || gstRate === null || gstRate > 100 || (hasInv && inventoryId === null)) {
      return { error: ITEM_ERR };
    }
    const linePaise = Math.round(qty * rate * 100);
    const lineGst = Math.round((linePaise * gstRate) / 100);
    subtotalPaise += linePaise;
    gstPaise += lineGst;
    lines.push({ description: it.description.trim(), qty, rate, gstRate, inventoryId });
  }
  return { lines, subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: (subtotalPaise + gstPaise) / 100 };
}

module.exports = { parseItems };
