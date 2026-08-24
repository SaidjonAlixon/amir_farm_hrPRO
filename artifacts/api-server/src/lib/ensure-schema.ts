/**
 * Server ishga tushganda jadvallarni yaratadi / yetishmayotgan ustunlarni qo‘shadi.
 * Hech qachon DROP / TRUNCATE / DELETE qilmaydi — barcha ma’lumot Railway Postgres’da qoladi.
 */
import { pool } from "@workspace/db";
import { logger } from "./logger";

const ENSURE_SQL = `
-- Kirish (stajyor o‘quv)
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
CREATE UNIQUE INDEX IF NOT EXISTS kirish_progress_user_uidx ON kirish_progress (user_id);

CREATE TABLE IF NOT EXISTS kirish_videos (
  id SERIAL PRIMARY KEY,
  stage INTEGER NOT NULL,
  youtube_url TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  updated_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS kirish_videos_stage_uidx ON kirish_videos (stage);
ALTER TABLE kirish_videos ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE kirish_videos ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
ALTER TABLE kirish_videos ADD COLUMN IF NOT EXISTS questions_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Chat
CREATE TABLE IF NOT EXISTS chats (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'direct',
  title TEXT,
  created_by_id INTEGER NOT NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chats_last_message_at_idx ON chats (last_message_at);

CREATE TABLE IF NOT EXISTS chat_members (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_members_chat_user_uidx ON chat_members (chat_id, user_id);
CREATE INDEX IF NOT EXISTS chat_members_user_idx ON chat_members (user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  reply_to_id INTEGER,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_messages_chat_id_idx ON chat_messages (chat_id);
CREATE INDEX IF NOT EXISTS chat_messages_chat_created_idx ON chat_messages (chat_id, created_at);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Maqsad
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
CREATE UNIQUE INDEX IF NOT EXISTS goal_daily_logs_user_date_uidx ON goal_daily_logs (user_id, work_date);

-- Eslatmalar
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

-- Tasks
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
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS candidate_id INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pipeline_stage TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Staffing
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

CREATE TABLE IF NOT EXISTS request_claims (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL,
  recruiter_id INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Branch needs
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

-- Branch audits
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
  categories JSONB NOT NULL,
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
ALTER TABLE branch_audits ADD COLUMN IF NOT EXISTS check_latitude DOUBLE PRECISION;
ALTER TABLE branch_audits ADD COLUMN IF NOT EXISTS check_longitude DOUBLE PRECISION;
ALTER TABLE branch_audits ADD COLUMN IF NOT EXISTS distance_meters INTEGER;

-- Employees GPS (checklist geofence) + employment + org
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'employees'
  ) THEN
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_status TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS org_role TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to_id INTEGER;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS location TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_type TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_label TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by_id INTEGER;
  END IF;
END $$;

UPDATE employees
SET location = regexp_replace(location, '^(Азия|АЗИЯ)', 'ТАШСЕЛМАШ')
WHERE location ~ '^(Азия|АЗИЯ)($|[[:space:]]|\|)';

-- Face ID / WebAuthn
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  transports TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS webauthn_credentials_cred_uidx ON webauthn_credentials (credential_id);
CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx ON webauthn_credentials (user_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS webauthn_challenges_challenge_idx ON webauthn_challenges (challenge);

CREATE TABLE IF NOT EXISTS face_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  descriptor TEXT NOT NULL,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS face_profiles_user_uidx ON face_profiles (user_id);
ALTER TABLE face_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;

CREATE TABLE IF NOT EXISTS attendance_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  user_id INTEGER,
  work_date TEXT NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'present',
  source TEXT NOT NULL DEFAULT 'manual',
  check_latitude DOUBLE PRECISION,
  check_longitude DOUBLE PRECISION,
  distance_meters INTEGER,
  notes TEXT,
  created_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_emp_date_uidx
  ON attendance_records (employee_id, work_date);
CREATE INDEX IF NOT EXISTS attendance_records_date_idx ON attendance_records (work_date);
CREATE INDEX IF NOT EXISTS attendance_records_employee_idx ON attendance_records (employee_id);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_latitude DOUBLE PRECISION;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_longitude DOUBLE PRECISION;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS distance_meters INTEGER;

-- Stajyor: intern xodimlar alohida akkaunt roli; Kirish faqat shu rolga
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'employees'
    ) THEN
      UPDATE users u
      SET role = 'stajyor'
      FROM employees e
      WHERE e.user_id = u.id
        AND e.org_role = 'intern'
        AND u.role IS DISTINCT FROM 'stajyor';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM users WHERE login = 'stajyor1') THEN
      INSERT INTO users (full_name, role, login, password, status)
      VALUES ('Demo Stajyor', 'stajyor', 'stajyor1', 'pass123', 'active');
    END IF;
  END IF;
END $$;
`;

/** Vercel cold start uchun — yetishmayotgan kritik ustunlar (tez) */
const CRITICAL_COLUMNS_SQL = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'employees'
  ) THEN
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_status TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS org_role TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to_id INTEGER;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS location TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_type TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_label TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by_id INTEGER;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS fixed_salary INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS bonus_percent DOUBLE PRECISION NOT NULL DEFAULT 30;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    UPDATE employees
    SET location = regexp_replace(location, '^(Азия|АЗИЯ)', 'ТАШСЕЛМАШ')
    WHERE location ~ '^(Азия|АЗИЯ)($|[[:space:]]|\|)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tasks'
  ) THEN
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS candidate_id INTEGER;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pipeline_stage TEXT;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  transports TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS webauthn_credentials_cred_uidx ON webauthn_credentials (credential_id);
CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx ON webauthn_credentials (user_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS webauthn_challenges_challenge_idx ON webauthn_challenges (challenge);

CREATE TABLE IF NOT EXISTS face_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  descriptor TEXT NOT NULL,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS face_profiles_user_uidx ON face_profiles (user_id);
ALTER TABLE face_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;

CREATE TABLE IF NOT EXISTS attendance_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  user_id INTEGER,
  work_date TEXT NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'present',
  source TEXT NOT NULL DEFAULT 'manual',
  check_latitude DOUBLE PRECISION,
  check_longitude DOUBLE PRECISION,
  distance_meters INTEGER,
  notes TEXT,
  created_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_emp_date_uidx
  ON attendance_records (employee_id, work_date);
CREATE INDEX IF NOT EXISTS attendance_records_date_idx ON attendance_records (work_date);
CREATE INDEX IF NOT EXISTS attendance_records_employee_idx ON attendance_records (employee_id);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_latitude DOUBLE PRECISION;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_longitude DOUBLE PRECISION;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS distance_meters INTEGER;

-- Stajyor: intern xodimlar alohida akkaunt roli; Kirish faqat shu rolga
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'employees'
    ) THEN
      UPDATE users u
      SET role = 'stajyor'
      FROM employees e
      WHERE e.user_id = u.id
        AND e.org_role = 'intern'
        AND u.role IS DISTINCT FROM 'stajyor';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM users WHERE login = 'stajyor1') THEN
      INSERT INTO users (full_name, role, login, password, status)
      VALUES ('Demo Stajyor', 'stajyor', 'stajyor1', 'pass123', 'active');
    END IF;
  END IF;
END $$;
`;

export async function ensureEmployeesOrgColumns(): Promise<void> {
  const timeoutMs = 8_000;
  const client = await pool.connect();
  try {
    await Promise.race([
      client.query(CRITICAL_COLUMNS_SQL),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`critical columns query timeout ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  } finally {
    client.release();
  }
}

export async function ensurePersistentSchema(): Promise<void> {
  const timeoutMs = process.env.VERCEL ? 8_000 : 30_000;
  const client = await pool.connect();
  try {
    await Promise.race([
      client.query(ENSURE_SQL),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`schema ensure query timeout ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    logger.info("Persistent DB schema ensured (CREATE IF NOT EXISTS only — no wipe)");
    await client.query(`
CREATE TABLE IF NOT EXISTS kpi_settings (
  id SERIAL PRIMARY KEY,
  attendance_weight INTEGER NOT NULL DEFAULT 40,
  tasks_weight INTEGER NOT NULL DEFAULT 30,
  checklist_weight INTEGER NOT NULL DEFAULT 30,
  work_start_hm TEXT NOT NULL DEFAULT '09:00',
  updated_by_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO kpi_settings (id, attendance_weight, tasks_weight, checklist_weight)
SELECT 1, 40, 30, 30
WHERE NOT EXISTS (SELECT 1 FROM kpi_settings WHERE id = 1);
ALTER TABLE kpi_settings ADD COLUMN IF NOT EXISTS work_start_hm TEXT NOT NULL DEFAULT '09:00';

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
);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_months_user_month_uidx ON payroll_months (user_id, month);

CREATE TABLE IF NOT EXISTS work_calendar_days (
  day TEXT PRIMARY KEY,
  is_work BOOLEAN NOT NULL,
  updated_by_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);
CREATE UNIQUE INDEX IF NOT EXISTS settlement_sheets_branch_month_uidx ON settlement_sheets (branch_name, month);

CREATE TABLE IF NOT EXISTS settlement_lines (
  id SERIAL PRIMARY KEY,
  sheet_id INTEGER NOT NULL,
  employee_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  full_name TEXT NOT NULL,
  phone TEXT,
  sales DOUBLE PRECISION NOT NULL DEFAULT 0,
  percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  fiksa DOUBLE PRECISION NOT NULL DEFAULT 0,
  plan_bonus DOUBLE PRECISION NOT NULL DEFAULT 0,
  avans DOUBLE PRECISION NOT NULL DEFAULT 0,
  inventory_fine DOUBLE PRECISION NOT NULL DEFAULT 0,
  time_fine DOUBLE PRECISION NOT NULL DEFAULT 0,
  expiry_hold DOUBLE PRECISION NOT NULL DEFAULT 0,
  card_amount DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS assigned_branch_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fixed_salary INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bonus_percent DOUBLE PRECISION NOT NULL DEFAULT 30;
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS plan_current DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS plan_prev DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS extra_bonus DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS fine_note TEXT;
ALTER TABLE settlement_lines ALTER COLUMN percent SET DEFAULT 0;
UPDATE settlement_lines SET percent = 0 WHERE ABS(percent - 0.006) < 0.0000001;
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure DB schema");
    throw err;
  } finally {
    client.release();
  }

  try {
    const { syncFarmasevtDepartmentAssignments } = await import("./farmasevt-department");
    await syncFarmasevtDepartmentAssignments();
  } catch (err) {
    logger.warn({ err }, "Farmasevt department sync skipped");
  }
  try {
    const { syncMoliyaDepartmentAssignments } = await import("./moliya-department");
    await syncMoliyaDepartmentAssignments();
  } catch (err) {
    logger.warn({ err }, "Moliya department sync skipped");
  }
}
