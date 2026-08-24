import pg from "../../lib/db/node_modules/pg/lib/index.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
UPDATE tasks
SET accepted_at = COALESCE(accepted_at, updated_at)
WHERE status IN ('in_progress', 'done', 'verified') AND accepted_at IS NULL;
`);

console.log("accepted_at column ok");
await pool.end();
