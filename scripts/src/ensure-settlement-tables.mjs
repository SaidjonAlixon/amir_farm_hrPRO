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

await client.connect();
await client.query(`
CREATE TABLE IF NOT EXISTS payroll_months (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  employee_id INTEGER,
  month TEXT NOT NULL,
  fixed_salary INTEGER NOT NULL DEFAULT 0,
  bonus_percent DOUBLE PRECISION NOT NULL DEFAULT 30,
  kpi_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_bonus INTEGER NOT NULL DEFAULT 0,
  bonus_amount INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by_id INTEGER,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);
await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS payroll_months_user_month_uidx ON payroll_months (user_id, month)`);
await client.query(`
CREATE TABLE IF NOT EXISTS work_calendar_days (
  day TEXT PRIMARY KEY,
  is_work BOOLEAN NOT NULL,
  updated_by_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);
await client.query(`
CREATE TABLE IF NOT EXISTS settlement_sheets (
  id SERIAL PRIMARY KEY,
  branch_name TEXT NOT NULL,
  month TEXT NOT NULL,
  plan_current DOUBLE PRECISION NOT NULL DEFAULT 0,
  plan_prev DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_net_rate DOUBLE PRECISION NOT NULL DEFAULT 0.88,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by_id INTEGER,
  approved_by_id INTEGER,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);
await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS settlement_sheets_branch_month_uidx ON settlement_sheets (branch_name, month)`);
await client.query(`
CREATE TABLE IF NOT EXISTS settlement_lines (
  id SERIAL PRIMARY KEY,
  sheet_id INTEGER NOT NULL,
  employee_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  full_name TEXT NOT NULL,
  phone TEXT,
  sales DOUBLE PRECISION NOT NULL DEFAULT 0,
  position TEXT,
  plan_current DOUBLE PRECISION NOT NULL DEFAULT 0,
  plan_prev DOUBLE PRECISION NOT NULL DEFAULT 0,
  percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  fiksa DOUBLE PRECISION NOT NULL DEFAULT 0,
  plan_bonus DOUBLE PRECISION NOT NULL DEFAULT 0,
  extra_bonus DOUBLE PRECISION NOT NULL DEFAULT 0,
  avans DOUBLE PRECISION NOT NULL DEFAULT 0,
  inventory_fine DOUBLE PRECISION NOT NULL DEFAULT 0,
  time_fine DOUBLE PRECISION NOT NULL DEFAULT 0,
  expiry_hold DOUBLE PRECISION NOT NULL DEFAULT 0,
  fine_note TEXT,
  card_amount DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);

const after = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('settlement_sheets','settlement_lines','payroll_months','work_calendar_days') ORDER BY 1`,
);
console.log("ok", after.rows.map((r) => r.tablename).join(", "));
await client.end();
