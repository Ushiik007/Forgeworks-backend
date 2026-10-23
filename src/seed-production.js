// Clean first-time setup for a LIVE system.
// Creates ONLY the admin login from your environment variables. No demo data, no demo users.
// Run once on the server with:  node src/seed-production.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function run() {
  const name = process.env.SEED_ADMIN_NAME;
  const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error('Missing SEED_ADMIN_NAME, SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD in environment variables.');
    process.exit(1);
  }
  if (password === 'ChangeMe123!' || password.length < 10) {
    console.error('Please use a strong password (at least 10 characters, not the demo one).');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const { rowCount } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'admin')
     ON CONFLICT (email) DO NOTHING`,
    [name, email, hash]
  );
  console.log(rowCount ? `Admin created: ${email}` : `Admin ${email} already exists, nothing changed.`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
