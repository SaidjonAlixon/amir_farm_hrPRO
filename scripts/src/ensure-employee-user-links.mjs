import pg from "../../lib/db/node_modules/pg/lib/index.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS user_id INTEGER;
`);

// mudir1 → FARM LYUKS mudiri
const mudir = await pool.query(`SELECT id FROM users WHERE login = 'mudir1' LIMIT 1`);
if (mudir.rows[0]) {
  const mgr = await pool.query(
    `SELECT id FROM employees
     WHERE org_role = 'manager'
       AND (location ILIKE '%FARM LYUKS%' OR full_name ILIKE '%Isayeva%')
     ORDER BY id LIMIT 1`,
  );
  if (mgr.rows[0]) {
    await pool.query(`UPDATE employees SET user_id = NULL WHERE user_id = $1`, [mudir.rows[0].id]);
    await pool.query(`UPDATE employees SET user_id = $1 WHERE id = $2`, [
      mudir.rows[0].id,
      mgr.rows[0].id,
    ]);
    console.log(`linked mudir1 → employee #${mgr.rows[0].id}`);
  } else {
    console.log("skip mudir1: FARM LYUKS manager not found");
  }
}

// koordinator1 → Aziza coordinator
const koor = await pool.query(`SELECT id FROM users WHERE login = 'koordinator1' LIMIT 1`);
if (koor.rows[0]) {
  const coord = await pool.query(
    `SELECT id FROM employees WHERE org_role = 'coordinator' ORDER BY id LIMIT 1`,
  );
  if (coord.rows[0]) {
    await pool.query(`UPDATE employees SET user_id = NULL WHERE user_id = $1`, [koor.rows[0].id]);
    await pool.query(`UPDATE employees SET user_id = $1 WHERE id = $2`, [
      koor.rows[0].id,
      coord.rows[0].id,
    ]);
    console.log(`linked koordinator1 → employee #${coord.rows[0].id}`);
  }
}

console.log("employee user_id links ok");
await pool.end();
