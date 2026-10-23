require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function seed() {
  console.log('Seeding Forgeworks ERP database...');

  // --- Employees ---
  const employees = [
    ['Ramesh Yadav', 'Welder', 'Day'],
    ['Suresh Patel', 'Carpenter', 'Day'],
    ['Aditi Rao', 'Supervisor', 'Day'],
    ['Vikas Chauhan', 'Polisher', 'Night'],
  ];
  const empIds = {};
  for (const [name, role, shift] of employees) {
    const { rows } = await pool.query(
      'INSERT INTO employees (name, role, shift) VALUES ($1,$2,$3) RETURNING id, name',
      [name, role, shift]
    );
    empIds[name] = rows[0].id;
  }

  // --- Admin login (from .env) + one login per seeded employee for demo purposes ---
  const adminPass = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!', 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'admin')
     ON CONFLICT (email) DO NOTHING`,
    [process.env.SEED_ADMIN_NAME || 'Admin', (process.env.SEED_ADMIN_EMAIL || 'admin@forgeworks.test').toLowerCase(), adminPass]
  );

  const workerPass = await bcrypt.hash('worker123', 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, employee_id) VALUES ($1,$2,$3,'employee',$4)
     ON CONFLICT (email) DO NOTHING`,
    ['Ramesh Yadav', 'ramesh@forgeworks.test', workerPass, empIds['Ramesh Yadav']]
  );
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, employee_id) VALUES ($1,$2,$3,'manager',$4)
     ON CONFLICT (email) DO NOTHING`,
    ['Aditi Rao', 'aditi@forgeworks.test', workerPass, empIds['Aditi Rao']]
  );

  // --- Inventory ---
  const inventory = [
    ['MS Steel Sheet 4x8 (16g)', 'Steel', 42, 'sheets', 20, 'Bhopal Steel Co.'],
    ['Teak Wood Plank', 'Wood', 18, 'planks', 25, 'Malwa Timber'],
    ['MS Square Pipe 1"', 'Steel', 60, 'pcs', 30, 'Bhopal Steel Co.'],
    ['Wood Screws 1.5"', 'Hardware', 340, 'pcs', 200, 'Anand Hardware'],
    ['PU Paint - Matte Black', 'Paint', 6, 'litres', 10, 'ColorTech'],
    ['Plywood 18mm', 'Wood', 22, 'sheets', 15, 'Malwa Timber'],
  ];
  for (const row of inventory) {
    await pool.query(
      'INSERT INTO inventory (name, category, qty, unit, threshold, supplier) VALUES ($1,$2,$3,$4,$5,$6)',
      row
    );
  }

  // --- Orders ---
  const orders = [
    ['ORD-101', 'Hotel Amaltas', 'Steel-frame Bed x10', 2, '2026-10-05'],
    ['ORD-102', 'Kunal Residences', 'Wooden Wardrobe x6', 0, '2026-10-12'],
    ['ORD-103', 'Cafe Bramha', 'Steel Chairs x24', 4, '2026-09-30'],
    ['ORD-104', 'Verma Interiors', 'Study Table x8', 3, '2026-10-08'],
  ];
  const orderIds = {};
  for (const [code, customer, item, stage, deadline] of orders) {
    const { rows } = await pool.query(
      'INSERT INTO orders (code, customer, item, stage, deadline) VALUES ($1,$2,$3,$4,$5) RETURNING id, code',
      [code, customer, item, stage, deadline]
    );
    orderIds[code] = rows[0].id;
  }

  // --- Tasks ---
  await pool.query('INSERT INTO tasks (employee_id, order_id, title, status) VALUES ($1,$2,$3,$4)',
    [empIds['Ramesh Yadav'], orderIds['ORD-101'], 'Weld frame - ORD-101', 'In Progress']);
  await pool.query('INSERT INTO tasks (employee_id, order_id, title, status) VALUES ($1,$2,$3,$4)',
    [empIds['Suresh Patel'], orderIds['ORD-102'], 'Cut plywood - ORD-102', 'Pending']);
  await pool.query('INSERT INTO tasks (employee_id, order_id, title, status) VALUES ($1,$2,$3,$4)',
    [empIds['Vikas Chauhan'], orderIds['ORD-103'], 'Polish chairs - ORD-103', 'Pending']);

  // --- Sales ---
  await pool.query(`INSERT INTO sales (code, customer, amount, status, date) VALUES
    ('INV-501','Hotel Amaltas',186000,'Pending','2026-09-18'),
    ('INV-502','Cafe Bramha',96000,'Paid','2026-09-10'),
    ('INV-503','Verma Interiors',64000,'Paid','2026-09-02')`);

  // --- Expenses ---
  await pool.query(`INSERT INTO expenses (description, amount, date) VALUES
    ('Steel sheet purchase',78000,'2026-09-14'),
    ('Salaries - Aug',142000,'2026-09-01'),
    ('Diesel & transport',9600,'2026-09-20')`);

  // --- Leaves ---
  await pool.query('INSERT INTO leaves (employee_id, from_date, to_date, reason, status) VALUES ($1,$2,$3,$4,$5)',
    [empIds['Vikas Chauhan'], '2026-09-29', '2026-09-30', 'Family function', 'Pending']);

  console.log('Done. Log in with:');
  console.log(`  Admin:   ${process.env.SEED_ADMIN_EMAIL || 'admin@forgeworks.test'} / ${process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!'}`);
  console.log('  Manager: aditi@forgeworks.test / worker123');
  console.log('  Worker:  ramesh@forgeworks.test / worker123');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
