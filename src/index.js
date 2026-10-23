require('dotenv').config();
const express = require('express');
require('express-async-errors'); // async route errors now reach the error handler instead of crashing the server
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is missing or too short (use at least 32 random characters).');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // behind Render/Railway: use the real client IP (needed for correct rate limiting)
app.disable('x-powered-by');
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
if (!allowedOrigins.length) {
  console.warn('WARNING: CORS_ORIGIN is empty. Set it to your frontend URL.');
}
app.use(cors({
  // Empty list: open only during local development, blocked in production
  origin: allowedOrigins.length ? allowedOrigins : (process.env.NODE_ENV === 'production' ? false : '*'),
}));
app.use(express.json({ limit: '100kb' }));

// Brute-force protection on LOGIN only (not /me or /register). Only failed attempts count.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts, please try again later' },
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler: turns common database/input errors into clean responses
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.code === '23505') return res.status(409).json({ error: 'That record already exists' });
  if (['23503', '23502', '23514', '22P02', '22007', '22008', '22003', '22001'].includes(err.code)) {
    return res.status(400).json({ error: 'Invalid or missing data in request' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Forgeworks ERP API listening on port ${PORT}`));
