import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url.replace(/([?&])channel_binding=require&?/gi, "$1").replace(/\?&/, "?").replace(/\?$/, ""),
  ssl: { rejectUnauthorized: false },
});

const sql = `
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  position TEXT NOT NULL,
  department_id INTEGER NOT NULL,
  mentor_id INTEGER,
  hired_at TEXT NOT NULL,
  candidate_id INTEGER,
  org_role TEXT,
  reports_to_id INTEGER,
  location TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  shift_type TEXT DEFAULT 'one',
  assigned_branch_id INTEGER,
  shift_label TEXT,
  employment_status TEXT NOT NULL DEFAULT 'working',
  user_id INTEGER,
  created_by_id INTEGER,
  photo_url TEXT,
  fixed_salary INTEGER NOT NULL DEFAULT 0,
  bonus_percent DOUBLE PRECISION NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'stage_change',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS staffing_alerts (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  manager_employee_id INTEGER,
  branch_location TEXT,
  shift_type TEXT,
  shift_label TEXT,
  employment_status TEXT NOT NULL,
  workflow_status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_by_id INTEGER,
  confirmed_by_id INTEGER,
  confirmed_at TIMESTAMPTZ,
  request_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

await client.connect();
const before = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`,
);
console.log("tables_before", before.rows.map((r) => r.tablename).join(", ") || "(none extra)");
await client.query(sql);
const after = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('employees','notifications','staffing_alerts')`,
);
console.log("core_ok", after.rows.map((r) => r.tablename).sort().join(", "));
await client.end();
