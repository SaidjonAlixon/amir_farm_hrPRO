import pg from "../../lib/db/node_modules/pg/lib/index.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS phone_interviews (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  recruiter_id INTEGER,
  interview_date TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS online_interviews (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  interview_date TEXT,
  questions_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience_level TEXT,
  score INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offline_interviews (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT,
  hr_id INTEGER,
  trainer_id INTEGER,
  attendance_status TEXT NOT NULL DEFAULT 'pending',
  hr_score INTEGER,
  hr_notes TEXT,
  trainer_score INTEGER,
  trainer_notes TEXT,
  result TEXT,
  result_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preboarding (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  position TEXT NOT NULL,
  salary TEXT NOT NULL,
  work_conditions TEXT,
  documents_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  position TEXT NOT NULL,
  department_id INTEGER NOT NULL,
  mentor_id INTEGER,
  hired_at TEXT NOT NULL,
  candidate_id INTEGER,
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

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'stage_change',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const client = await pool.connect();
try {
  const existing = await client.query(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog','information_schema')
     ORDER BY 1,2`,
  );
  console.log("Existing tables:", existing.rows);

  await client.query(sql);
  console.log("Schema ensured.");
} finally {
  client.release();
  await pool.end();
}
