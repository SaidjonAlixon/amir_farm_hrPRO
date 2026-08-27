import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS recruiter_id INTEGER;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
`;

try {
  await pool.query(sql);
  console.log("OK: vacancy columns added");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
