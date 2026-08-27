import pg from "../../lib/db/node_modules/pg/lib/index.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
CREATE TABLE IF NOT EXISTS branch_needs (
  id SERIAL PRIMARY KEY,
  need_type TEXT NOT NULL,
  branch_location TEXT,
  manager_employee_id INTEGER,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by_id INTEGER,
  confirmed_by_id INTEGER,
  confirmed_at TIMESTAMPTZ,
  assigned_user_id INTEGER,
  assigned_at TIMESTAMPTZ,
  task_id INTEGER,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  verified_by_id INTEGER,
  verified_at TIMESTAMPTZ,
  closed_by_id INTEGER,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

await pool.query(`
ALTER TABLE branch_needs
  ADD COLUMN IF NOT EXISTS confirmed_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS task_id INTEGER,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
`);

await pool.query(`UPDATE branch_needs SET status = 'pending' WHERE status = 'open';`);

await pool.query(`
UPDATE branch_needs
SET assigned_at = COALESCE(assigned_at, confirmed_at, created_at)
WHERE status IN ('assigned', 'in_progress', 'done', 'verified')
  AND assigned_user_id IS NOT NULL
  AND assigned_at IS NULL;
`);

console.log("branch_needs timeline schema ok");
await pool.end();
