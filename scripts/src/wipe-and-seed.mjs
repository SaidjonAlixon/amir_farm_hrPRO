import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

function loadEnv() {
  try {
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
  } catch {
    /* ignore */
  }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const pool = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/i.test(url)
    ? undefined
    : { rejectUnauthorized: false },
});

/** Barcha app jadvallari — FK tartibida RESTART IDENTITY CASCADE */
const tables = [
  "chat_messages",
  "chat_members",
  "chats",
  "kirish_progress",
  "goal_daily_logs",
  "user_goals",
  "reminder_events",
  "reminders",
  "branch_audits",
  "branch_needs",
  "tasks",
  "staffing_alerts",
  "request_claims",
  "notifications",
  "phone_interviews",
  "online_interviews",
  "offline_interviews",
  "preboarding",
  "offers",
  "internships",
  "employees",
  "candidates",
  "vacancies",
  "channels",
  "requests",
  "users",
  "departments",
];

await pool.connect();
console.log("Connected. Wiping...");

const existing = await pool.query(`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public'
`);
const present = new Set(existing.rows.map((r) => r.tablename));
const toWipe = tables.filter((t) => present.has(t));
const extra = [...present].filter(
  (t) => !tables.includes(t) && !t.startsWith("pg_") && t !== "spatial_ref_sys",
);

if (toWipe.length) {
  await pool.query(
    `TRUNCATE TABLE ${toWipe.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
  console.log("Truncated:", toWipe.join(", "));
}
if (extra.length) {
  // Qo‘shimcha jadvallar ham tozalansin (agar mavjud bo‘lsa)
  try {
    await pool.query(
      `TRUNCATE TABLE ${extra.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
    console.log("Also truncated extras:", extra.join(", "));
  } catch (e) {
    console.warn("Extra truncate skipped:", e.message);
  }
}

console.log("Seeding departments + login users...");

const departments = ["Rekruting", "HR", "Trening", "Farmatsiya", "Farmasevt", "Laboratoriya"];
const deptIds = {};
for (const name of departments) {
  const r = await pool.query(
    `INSERT INTO departments (name) VALUES ($1) RETURNING id`,
    [name],
  );
  deptIds[name] = r.rows[0].id;
}

const users = [
  ["System Admin", "admin", null, "admin", "admin123", "+998901000001"],
  ["Aziza Recruiter", "recruiter", "Rekruting", "recruiter1", "pass123", "+998901000002"],
  ["Dilnoza HR", "hr", "HR", "hr1", "pass123", "+998901000003"],
  ["Jasur Trener", "trainer", "Trening", "trainer1", "pass123", "+998901000004"],
  ["Bahodir Direktor", "director", null, "director1", "pass123", "+998901000005"],
  ["Madina Bo'lim boshlig'i", "department_head", "Farmatsiya", "dept_head1", "pass123", "+998901000006"],
  ["Sardor Mudir", "mudir", "Farmasevt", "mudir1", "pass123", "+998901000007"],
  ["Nilufar Koordinator", "koordinator", "Farmatsiya", "koordinator1", "pass123", "+998901000008"],
  ["Akmal Texnik", "texnik", "Farmatsiya", "texnik1", "pass123", "+998901000009"],
  ["Zarina Ombor", "ombor", "Farmatsiya", "ombor1", "pass123", "+998901000010"],
  ["Dilshod Farmasevt", "farmasevt", "Farmasevt", "farmasevt1", "pass123", "+998901000011"],
  ["Malika Stajyor", "stajyor", "Farmasevt", "stajyor1", "pass123", "+998901000012"],
];

for (const [fullName, role, dept, login, password, phone] of users) {
  await pool.query(
    `INSERT INTO users (full_name, role, department_id, login, password, phone, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
    [fullName, role, dept ? deptIds[dept] : null, login, password, phone],
  );
  console.log(" +", login, role);
}

const counts = await pool.query(`
  SELECT
    (SELECT COUNT(*)::int FROM users) AS users,
    (SELECT COUNT(*)::int FROM departments) AS departments,
    (SELECT COUNT(*)::int FROM candidates) AS candidates,
    (SELECT COUNT(*)::int FROM vacancies) AS vacancies,
    (SELECT COUNT(*)::int FROM requests) AS requests,
    (SELECT COUNT(*)::int FROM employees) AS employees,
    (SELECT COUNT(*)::int FROM chats) AS chats,
    (SELECT COUNT(*)::int FROM kirish_progress) AS kirish
`);
console.log("Counts after wipe+seed:", counts.rows[0]);
console.log("DONE — system ready from zero");
await pool.end();
