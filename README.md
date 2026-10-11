# Forgeworks ERP — Backend API

A real Node.js + Express + PostgreSQL backend for the Forgeworks ERP prototype. Replaces the
browser-only `localStorage` version with a shared database, JWT login, and role-based
permissions (Admin / Manager / Worker) enforced on the server.

## 1. Local setup

```bash
cd forgeworks-backend
npm install
cp .env.example .env      # then edit .env with your own values
```

You need a PostgreSQL database. Easiest local option:

```bash
# macOS (Homebrew)
brew install postgresql@16 && brew services start postgresql@16
createdb forgeworks

# Or run Postgres in Docker instead:
docker run --name forgeworks-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=forgeworks -p 5432:5432 -d postgres:16
```

Then create the tables and load demo data:

```bash
npm run migrate   # creates tables from src/schema.sql
npm run seed       # inserts demo employees, orders, inventory + login accounts
npm run dev         # starts the API on http://localhost:4000 (auto-restarts on changes)
```

The seed script prints three ready-to-use logins (Admin, Manager, Worker) — check your terminal output.

## 2. API overview

All endpoints are under `/api`. Every route except `/api/auth/login` and `/api/health` requires
an `Authorization: Bearer <token>` header, obtained from login.

| Area | Endpoint | Who |
|---|---|---|
| Auth | `POST /api/auth/login` | anyone |
| Auth | `POST /api/auth/register` | admin |
| Inventory | `GET /api/inventory` | all roles |
| Inventory | `POST /api/inventory`, `PATCH /api/inventory/:id/restock` | admin |
| Orders | `GET /api/orders` | all roles |
| Orders | `POST /api/orders` | admin |
| Orders | `PATCH /api/orders/:id/advance` | admin, manager |
| Employees | `GET /api/employees` | admin, manager |
| Employees | `POST /api/employees/clock-in`, `/clock-out` | worker (self) |
| Employees | `GET /api/employees/me/attendance` | worker (self) |
| Tasks | `GET /api/tasks` (own tasks if worker, all if admin/manager) | all roles |
| Tasks | `POST /api/tasks` | admin, manager |
| Tasks | `PATCH /api/tasks/:id` (status) | owner worker, or admin/manager |
| Sales | `GET /api/sales`, `POST /api/sales`, `PATCH /api/sales/:id/mark-paid` | admin, manager (post/mark-paid: admin) |
| Expenses | `GET/POST /api/expenses`, `GET /api/expenses/summary` | admin |
| Leaves | `GET/POST /api/leaves` | worker (own), admin/manager (all) |
| Leaves | `PATCH /api/leaves/:id` (approve/reject) | admin, manager |

Example login request:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@forgeworks.test","password":"ChangeMe123!"}'
```

## 3. Connecting the existing frontend

The HTML prototype currently reads/writes `localStorage`. To point it at this API instead:

1. Replace `let DB = JSON.parse(localStorage.getItem(...))` with an `async function loadDB()`
   that calls `fetch('/api/inventory')`, `fetch('/api/orders')`, etc. and assembles the same
   shape the render functions already expect.
2. Replace the login screen's role-picker with a real form that calls `POST /api/auth/login`,
   stores the returned `token`, and sends it as `Authorization: Bearer <token>` on every
   subsequent request.
3. Replace each `save()` call (e.g. clicking "Advance stage", "Restock", "Add item") with the
   matching `fetch(..., { method: 'POST' or 'PATCH', headers: {Authorization: ...}, body: ... })`
   call, then re-render from the response.

Happy to do this wiring for you as a next step if you want the full app running end-to-end.

## 4. Deploying it for real

1. **Database**: create a free/low-cost Postgres instance on [Render](https://render.com),
   [Railway](https://railway.app), or [Supabase](https://supabase.com). Copy the connection
   string into `DATABASE_URL`.
2. **API**: push this folder to a GitHub repo, then create a "Web Service" on Render or Railway
   pointing at it. Set the environment variables from `.env.example` in their dashboard
   (use a strong random `JWT_SECRET`). Set the start command to `npm start` and run
   `npm run migrate && npm run seed` once from their shell/console.
3. **Frontend**: host the HTML file on Vercel, Netlify, or the same platform, and set
   `CORS_ORIGIN` on the backend to that frontend's URL.
4. **Domain**: point your domain's DNS at whichever platform you used, following their
   "custom domain" instructions.

## 5. Security notes before going live

- Change `JWT_SECRET` and the seeded admin password immediately — don't ship the defaults.
- Add rate limiting (e.g. `express-rate-limit`) on `/api/auth/login` to slow down brute force.
- Add input validation (e.g. `zod` or `express-validator`) on all POST/PATCH bodies —
  this version does only minimal checks to keep the code readable.
- Turn on SSL enforcement and automatic backups on whichever Postgres host you choose.
