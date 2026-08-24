import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

function loadEnv() {
  const raw = readFileSync(resolve(root, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/i.test(url)
    ? undefined
    : { rejectUnauthorized: false },
});

await client.connect();

await client.query(`
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  head_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  department_id INTEGER,
  login TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  telegram_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

const departments = ["HR", "Farmatsiya", "Farmasevt"];
const deptIds = {};
for (const name of departments) {
  const existing = await client.query(`SELECT id FROM departments WHERE name = $1`, [name]);
  if (existing.rows[0]) {
    deptIds[name] = existing.rows[0].id;
    continue;
  }
  const r = await client.query(
    `INSERT INTO departments (name) VALUES ($1) RETURNING id`,
    [name],
  );
  deptIds[name] = r.rows[0].id;
}

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

for (const [fullName, role, dept, login, password, phone] of users) {
  await client.query(
    `INSERT INTO users (full_name, role, department_id, login, password, phone, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     ON CONFLICT (login) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       role = EXCLUDED.role,
       department_id = EXCLUDED.department_id,
       password = EXCLUDED.password,
       phone = EXCLUDED.phone,
       status = 'active'`,
    [fullName, role, dept ? deptIds[dept] : null, login, password, phone],
  );
  console.log(" +", login, role);
}

const list = await client.query(
  `SELECT login, role, full_name FROM users ORDER BY id`,
);
console.log("Users:", list.rows);
await client.end();
