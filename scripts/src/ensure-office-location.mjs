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

const lat = 41 + 21 / 60 + 5.5 / 3600;
const lng = 69 + 23 / 60 + 6.7 / 3600;
const label = `Asosiy ofis · 41°21'05.5"N 69°23'06.7"E`;

await client.connect();
await client.query(`
CREATE TABLE IF NOT EXISTS kpi_settings (
  id SERIAL PRIMARY KEY,
  attendance_weight INTEGER NOT NULL DEFAULT 40,
  tasks_weight INTEGER NOT NULL DEFAULT 30,
  checklist_weight INTEGER NOT NULL DEFAULT 30,
  work_start_hm TEXT NOT NULL DEFAULT '09:00',
  office_latitude DOUBLE PRECISION,
  office_longitude DOUBLE PRECISION,
  office_label TEXT,
  updated_by_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);
await client.query(`
INSERT INTO kpi_settings (id, attendance_weight, tasks_weight, checklist_weight)
SELECT 1, 40, 30, 30
WHERE NOT EXISTS (SELECT 1 FROM kpi_settings WHERE id = 1)`);
await client.query(`ALTER TABLE kpi_settings ADD COLUMN IF NOT EXISTS office_latitude DOUBLE PRECISION`);
await client.query(`ALTER TABLE kpi_settings ADD COLUMN IF NOT EXISTS office_longitude DOUBLE PRECISION`);
await client.query(`ALTER TABLE kpi_settings ADD COLUMN IF NOT EXISTS office_label TEXT`);
await client.query(
  `UPDATE kpi_settings SET office_latitude = $1, office_longitude = $2, office_label = $3, updated_at = NOW() WHERE id = 1`,
  [lat, lng, label],
);

const row = await client.query(
  `SELECT office_latitude, office_longitude, office_label FROM kpi_settings WHERE id = 1`,
);
console.log("office_ok", row.rows[0]);
await client.end();
