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
CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  position TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  requirements TEXT,
  salary_range TEXT,
  deadline TEXT,
  reason TEXT,
  city TEXT,
  district TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'submitted',
  assigned_to_id INTEGER,
  assigned_at TIMESTAMPTZ,
  created_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vacancies (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  salary_range TEXT,
  location TEXT,
  schedule TEXT,
  benefits TEXT,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  recruiter_id INTEGER,
  deadline TIMESTAMPTZ,
  last_reminder_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  birth_date TEXT,
  phone TEXT NOT NULL,
  address TEXT,
  photo_url TEXT,
  education TEXT,
  experience TEXT,
  expected_salary TEXT,
  notes TEXT,
  vacancy_id INTEGER NOT NULL,
  recruiter_id INTEGER,
  stage TEXT NOT NULL DEFAULT 'phone_interview',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chats (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'direct',
  title TEXT,
  created_by_id INTEGER NOT NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_members (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to_id INTEGER,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  notify_at TIMESTAMPTZ,
  remind_interval_minutes INTEGER,
  last_notified_at TIMESTAMPTZ,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reminder_events (
  id SERIAL PRIMARY KEY,
  reminder_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  note TEXT,
  from_due_at TIMESTAMPTZ,
  to_due_at TIMESTAMPTZ,
  from_status TEXT,
  to_status TEXT,
  created_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_at TIMESTAMPTZ,
  assignee_kind TEXT NOT NULL DEFAULT 'user',
  assignee_id INTEGER NOT NULL,
  created_by_id INTEGER NOT NULL,
  candidate_id INTEGER,
  pipeline_stage TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  completion_note TEXT,
  completion_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  extension_requested_due_at TIMESTAMPTZ,
  extension_note TEXT,
  extension_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS internships (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  trainer_id INTEGER,
  start_date TEXT NOT NULL,
  end_date TEXT,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluations JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ongoing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS branch_needs (
  id SERIAL PRIMARY KEY,
  need_type TEXT NOT NULL,
  branch_location TEXT,
  manager_employee_id INTEGER,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by_id INTEGER,
  confirmed_by_id INTEGER,
  confirmed_at TIMESTAMPTZ,
  assigned_user_id INTEGER,
  assigned_at TIMESTAMPTZ,
  task_id INTEGER,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  verified_by_id INTEGER,
  verified_at TIMESTAMPTZ,
  closed_by_id INTEGER,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS branch_audits (
  id SERIAL PRIMARY KEY,
  manager_employee_id INTEGER NOT NULL,
  branch_location TEXT,
  manager_name TEXT,
  visit_date TEXT NOT NULL,
  visit_name TEXT NOT NULL DEFAULT '1-tashrif',
  month_label TEXT,
  coordinator_id INTEGER NOT NULL,
  coordinator_name TEXT,
  general_note TEXT,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  score_percent INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  yes_count INTEGER NOT NULL DEFAULT 0,
  no_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  check_latitude DOUBLE PRECISION,
  check_longitude DOUBLE PRECISION,
  distance_meters INTEGER,
  status TEXT NOT NULL DEFAULT 'saved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS kirish_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  current_stage INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress',
  stages_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS goal_daily_logs (
  id SERIAL PRIMARY KEY,
  goal_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  work_date DATE NOT NULL,
  content TEXT NOT NULL,
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
  `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (
    'employees','notifications','staffing_alerts','requests','vacancies','channels','candidates',
    'chats','chat_members','chat_messages','reminders','reminder_events','tasks',
    'internships','branch_needs','branch_audits','kirish_progress','user_goals','goal_daily_logs'
  ) ORDER BY 1`,
);
console.log("core_ok", after.rows.map((r) => r.tablename).join(", "));
await client.end();
