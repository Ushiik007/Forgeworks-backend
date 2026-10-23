const { Pool } = require('pg');
require('dotenv').config();

const isLocal = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Managed Postgres (Neon etc.): use SSL and verify the server certificate
  ssl: isLocal ? false : { rejectUnauthorized: true },
});

// Without this handler, a dropped idle connection (common on serverless Postgres) crashes the whole server
pool.on('error', (err) => console.error('Unexpected database connection error:', err.message));

module.exports = { pool };
