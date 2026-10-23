// Small input-validation helpers

const isText = (v, min = 1, max = 200) =>
  typeof v === 'string' && v.trim().length >= min && v.length <= max;

function toNumber(v) {
  if (typeof v === 'boolean' || v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const toPositive = (v) => { const n = toNumber(v); return n !== null && n > 0 ? n : null; };
const toNonNegative = (v) => { const n = toNumber(v); return n !== null && n >= 0 ? n : null; };

const toInt = (v) => { const n = toNumber(v); return n !== null && Number.isInteger(n) ? n : null; };

// ?limit=&offset= for list endpoints
function paging(query, def = 500, max = 1000) {
  let limit = toInt(query.limit);
  let offset = toInt(query.offset);
  if (limit === null || limit < 1) limit = def;
  if (limit > max) limit = max;
  if (offset === null || offset < 0) offset = 0;
  return { limit, offset };
}

// Builds "UPDATE table SET a=$1, b=$2 WHERE id=$3". Column names come only from code, never from users.
function buildUpdate(table, fields, id) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  return { text: `UPDATE ${table} SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`, values: [...keys.map(k => fields[k]), id] };
}

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// "Today" and "now" in Indian time, regardless of the database server's timezone (Neon runs in UTC)
const IST_DATE = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
const IST_TIME = "(now() AT TIME ZONE 'Asia/Kolkata')::time";

module.exports = { isText, toNumber, toInt, toPositive, toNonNegative, isDate, paging, buildUpdate, IST_DATE, IST_TIME };
