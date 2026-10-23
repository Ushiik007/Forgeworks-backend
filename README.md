# Forgeworks ERP - Backend API (v1.1)

Node.js + Express + PostgreSQL. JWT login, roles: admin / manager / employee.

## Run it
```
npm install
npm run migrate     # safe to re-run; REQUIRED after updating (adds new columns/tables)
npm run dev         # http://localhost:4000
```
First live admin: set SEED_ADMIN_NAME / SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in the environment, then `npm run seed:prod`.
Never run `npm run seed` on a live database (it creates demo users with a known password).
Set CORS_ORIGIN to your frontend URL (comma-separate several).

## Endpoints (all under /api, token required except login and health)
| Area | Endpoint | Who |
|---|---|---|
| Health | GET /health | anyone |
| Auth | POST /auth/login | anyone |
| Auth | GET /auth/me, POST /auth/change-password | any user |
| Users | POST /auth/register, GET /auth/users, PATCH /auth/users/:id (isActive, role), POST /auth/users/:id/reset-password | admin |
| Dashboard | GET /dashboard (one call: stock, orders, invoices, attendance, leaves, expenses) | admin, manager |
| Inventory | GET /inventory, GET /inventory/low-stock | all |
| Inventory | POST, PATCH /:id, PATCH /:id/restock, DELETE /:id | admin |
| Inventory | PATCH /:id/consume {amount} | admin, manager |
| Orders | GET /orders, GET /orders/overdue | all |
| Orders | POST, PATCH /:id, DELETE /:id | admin |
| Orders | PATCH /:id/advance | admin, manager |
| Employees | GET /employees | admin, manager |
| Employees | POST, PATCH /:id, DELETE /:id | admin |
| Employees | POST /employees/clock-in, /clock-out, GET /employees/me/attendance | anyone linked to an employee profile |
| Tasks | GET /tasks (own if employee) | all |
| Tasks | POST /tasks, DELETE /tasks/:id | admin, manager |
| Tasks | PATCH /tasks/:id (status) | owner, or admin/manager |
| Sales | GET /sales, GET /sales/:id | admin, manager |
| Sales | POST /sales, PATCH /:id/mark-paid, DELETE /:id (unpaid only) | admin |
| Expenses | GET, GET /summary, POST, PATCH /:id, DELETE /:id | admin |
| Leaves | GET, POST (anyone with an employee profile) | all |
| Leaves | GET /pending, PATCH /:id (Approved/Rejected, pending only) | admin, manager |

## GST invoice example
```
POST /api/sales
{ "customer": "Hotel Amaltas", "customerGstin": "23ABCDE1234F1Z5",
  "items": [ { "description": "Steel-frame bed", "qty": 2, "rate": 18000, "gstRate": 18, "inventoryId": 3 } ] }
```
The server works out subtotal, GST and total, numbers the invoice (INV-1001, INV-1002, ...)
and deducts stock for lines that have an inventoryId. If stock is short, nothing is saved (409).

## Notes
- "Today" always means Indian time (Asia/Kolkata).
- Lists (sales, expenses) return 500 rows by default; use ?limit=&offset= for more.
- Money fields come back from PostgreSQL as strings in some cases; convert with Number() in the frontend.
