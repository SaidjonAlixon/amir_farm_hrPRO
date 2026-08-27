import pg from "../../lib/db/node_modules/pg/lib/index.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const departments = ["HR", "Farmatsiya", "Farmasevt"];

const users = [
  ["System Admin", "admin", null, "admin", "admin123", "+998901000001"],
  ["Bahodir Direktor", "director", null, "director1", "pass123", "+998901000005"],
  ["Nilufar Koordinator", "koordinator", "Farmatsiya", "koordinator1", "pass123", "+998901000008"],
  ["HR Direktor", "hr_direktor", "HR", "hrdirektor1", "pass123", "+998901000013"],
  ["HR Menejer", "hr_menejer", "HR", "hrmenejer1", "pass123", "+998901000014"],
  ["Sardor Mudir", "mudir", "Farmasevt", "mudir1", "pass123", "+998901000007"],
  ["Dilshod Farmasevt", "farmasevt", "Farmasevt", "farmasevt1", "pass123", "+998901000011"],
  ["Malika Stajyor", "stajyor", "Farmasevt", "stajyor1", "pass123", "+998901000012"],
];

const client = await pool.connect();
try {
  const deptMap = new Map();
  for (const name of departments) {
    const existing = await client.query("SELECT id FROM departments WHERE name = $1", [name]);
    if (existing.rows[0]) {
      deptMap.set(name, existing.rows[0].id);
      continue;
    }
    const inserted = await client.query(
      "INSERT INTO departments (name) VALUES ($1) RETURNING id",
      [name],
    );
    deptMap.set(name, inserted.rows[0].id);
  }
  console.log("Departments ready");

  for (const [fullName, role, dept, login, password, phone] of users) {
    const existing = await client.query("SELECT id FROM users WHERE login = $1", [login]);
    if (existing.rows[0]) {
      console.log(`  skip ${login}`);
      continue;
    }
    await client.query(
      `INSERT INTO users (full_name, role, department_id, login, password, phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [fullName, role, dept ? deptMap.get(dept) : null, login, password, phone],
    );
    console.log(`  + ${login}`);
  }
  console.log("Seed complete");
} finally {
  client.release();
  await pool.end();
}
