import pg from "pg";
import { readFileSync } from "fs";

const raw = readFileSync(".env", "utf8");
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

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const users = [
  { fullName: "HR Direktor", role: "hr_direktor", login: "hrdirektor1", password: "pass123" },
  { fullName: "HR Auditor", role: "hr_auditor", login: "hrauditor1", password: "pass123" },
  { fullName: "HR Menejer", role: "hr_menejer", login: "hrmenejer1", password: "pass123" },
];

for (const u of users) {
  const existing = await client.query(`SELECT id, role FROM users WHERE login = $1`, [u.login]);
  if (existing.rows.length) {
    await client.query(`UPDATE users SET role = $1, full_name = $2, status = 'active' WHERE login = $3`, [
      u.role,
      u.fullName,
      u.login,
    ]);
    console.log("updated", u.login, "->", u.role);
  } else {
    await client.query(
      `INSERT INTO users (full_name, role, login, password, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [u.fullName, u.role, u.login, u.password],
    );
    console.log("created", u.login, u.role);
  }
}

// Keep legacy hr1 as menejer-equivalent
await client.query(
  `UPDATE users SET role = 'hr_menejer' WHERE login = 'hr1' AND role = 'hr'`,
);
console.log("legacy hr1 -> hr_menejer (if was hr)");

await client.end();
