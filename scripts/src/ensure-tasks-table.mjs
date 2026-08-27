import pg from "../../lib/db/node_modules/pg/lib/index.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_at TIMESTAMPTZ,
  assignee_kind TEXT NOT NULL DEFAULT 'user',
  assignee_id INTEGER NOT NULL,
  created_by_id INTEGER NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

console.log("tasks table ok");
await pool.end();
