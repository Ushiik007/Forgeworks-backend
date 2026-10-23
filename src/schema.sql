-- Forgeworks ERP schema
-- Run with: npm run migrate

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,          -- job role e.g. Welder, Carpenter, Supervisor
  shift TEXT NOT NULL DEFAULT 'Day'
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','employee')),
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent')) DEFAULT 'absent',
  clock_in TIME,
  clock_out TIME,
  UNIQUE(employee_id, date)
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  threshold NUMERIC NOT NULL DEFAULT 0,
  supplier TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,          -- e.g. ORD-101
  customer TEXT NOT NULL,
  item TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0,   -- 0 Cutting .. 4 Packing (see STAGES in frontend)
  deadline DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending','In Progress','Done')) DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,          -- e.g. INV-501
  customer TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending','Paid')) DEFAULT 'Pending',
  date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS leaves (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('Pending','Approved','Rejected')) DEFAULT 'Pending'
);


-- ===== v1.1 additions (safe to run on an existing database) =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_gstin TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS gst_amount NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sales_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  rate NUMERIC NOT NULL CHECK (rate >= 0),
  gst_rate NUMERIC NOT NULL DEFAULT 0 CHECK (gst_rate >= 0 AND gst_rate <= 100)
);

CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1001;

CREATE INDEX IF NOT EXISTS idx_sales_items_sale ON sales_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_tasks_employee ON tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);
CREATE INDEX IF NOT EXISTS idx_orders_deadline ON orders(deadline);
