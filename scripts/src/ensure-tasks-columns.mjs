import pg from "../../lib/db/node_modules/pg/lib/index.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extension_requested_due_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extension_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extension_status TEXT;
`);

console.log("tasks columns ok");
await pool.end();
