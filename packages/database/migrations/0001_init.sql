-- 0001_init.sql — initial schema for AI Job Application Agent

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM (
    'discovered','matched','approved','applying','applied','screening','interview','offer',
    'rejected','withdrawn','expired','failed','needs_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE match_tier AS ENUM ('excellent','good','review','reject');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE match_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_state AS ENUM (
    'offline','connecting','online','idle','discovering','matching','waiting_approval',
    'applying','submitted','error','needs_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_task_status AS ENUM ('queued','claimed','running','completed','failed','needs_review','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_platform AS ENUM ('laptop','android');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_task_type AS ENUM ('discover','apply');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_kind AS ENUM ('cv','cover_letter','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE answer_source AS ENUM ('user','profile','ai');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL,
  password_hash varchar(255) NOT NULL,
  name varchar(255) NOT NULL,
  role varchar(32) NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind document_kind NOT NULL DEFAULT 'cv',
  filename varchar(255) NOT NULL,
  storage_key varchar(500) NOT NULL,
  mime_type varchar(120),
  size_bytes integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_user_idx ON documents (user_id);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  headline varchar(200) NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  years_experience integer NOT NULL DEFAULT 0,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_authorization varchar(120) NOT NULL DEFAULT '',
  remote_preferred boolean NOT NULL DEFAULT false,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  expected_salary_min integer,
  expected_salary_max integer,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_cv_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_uq ON profiles (user_id);

CREATE TABLE IF NOT EXISTS job_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portals jsonb NOT NULL DEFAULT '[]'::jsonb,
  job_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  min_salary integer,
  max_salary integer,
  min_match_score integer NOT NULL DEFAULT 60,
  require_approval boolean NOT NULL DEFAULT true,
  auto_discover boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_preferences_user_uq ON job_preferences (user_id);

CREATE TABLE IF NOT EXISTS job_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portal varchar(80) NOT NULL,
  label varchar(160) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  base_url varchar(500),
  settings jsonb,
  last_synced_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS job_portals_user_portal_uq ON job_portals (user_id, portal);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_job_id varchar(255),
  portal varchar(80) NOT NULL,
  job_url varchar(1000) NOT NULL,
  normalized_url varchar(900) NOT NULL,
  title varchar(300) NOT NULL,
  company varchar(300) NOT NULL DEFAULT '',
  location varchar(300) NOT NULL DEFAULT '',
  salary_text varchar(200) NOT NULL DEFAULT '',
  salary_min integer,
  salary_max integer,
  description text NOT NULL DEFAULT '',
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  employment_type varchar(80) NOT NULL DEFAULT '',
  posted_at timestamptz,
  source varchar(32) NOT NULL DEFAULT 'agent',
  raw jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_portal_external_uq ON jobs (portal, external_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_portal_url_uq ON jobs (portal, normalized_url);
CREATE INDEX IF NOT EXISTS jobs_last_seen_idx ON jobs (last_seen_at);

CREATE TABLE IF NOT EXISTS job_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score integer NOT NULL,
  tier match_tier NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  status match_status NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_matches_user_job_uq ON job_matches (user_id, job_id);
CREATE INDEX IF NOT EXISTS job_matches_user_status_idx ON job_matches (user_id, status);

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  external_job_id varchar(255),
  company_name varchar(300) NOT NULL,
  position varchar(300) NOT NULL,
  portal varchar(80) NOT NULL,
  job_url varchar(1000) NOT NULL,
  location varchar(300) NOT NULL DEFAULT '',
  salary varchar(200) NOT NULL DEFAULT '',
  match_score integer,
  cv_used varchar(255),
  status application_status NOT NULL DEFAULT 'discovered',
  source varchar(32) NOT NULL DEFAULT 'agent',
  application_hash varchar(400) NOT NULL,
  notes text NOT NULL DEFAULT '',
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS applications_user_hash_uq ON applications (user_id, application_hash);
CREATE INDEX IF NOT EXISTS applications_user_status_idx ON applications (user_id, status);
CREATE INDEX IF NOT EXISTS applications_applied_idx ON applications (applied_at);

CREATE TABLE IF NOT EXISTS application_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question varchar(1000) NOT NULL,
  normalized_question varchar(1000) NOT NULL,
  answer text NOT NULL,
  source answer_source NOT NULL DEFAULT 'user',
  confidence integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_answers_app_idx ON application_answers (application_id);

CREATE TABLE IF NOT EXISTS application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(80) NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_events_user_created_idx ON application_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS application_events_app_idx ON application_events (application_id);

CREATE TABLE IF NOT EXISTS answer_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question varchar(1000) NOT NULL,
  normalized_question varchar(1000) NOT NULL,
  answer text NOT NULL,
  source answer_source NOT NULL DEFAULT 'user',
  confidence integer NOT NULL DEFAULT 100,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS answer_memory_user_q_uq ON answer_memory (user_id, normalized_question);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform agent_platform NOT NULL DEFAULT 'laptop',
  version varchar(40) NOT NULL DEFAULT '',
  state agent_state NOT NULL DEFAULT 'offline',
  user_agent varchar(500),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb
);
CREATE INDEX IF NOT EXISTS agent_sessions_user_idx ON agent_sessions (user_id);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL,
  type agent_task_type NOT NULL,
  payload jsonb NOT NULL,
  status agent_task_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  error text,
  stop_reason varchar(80),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS agent_tasks_user_status_idx ON agent_tasks (user_id, status);
CREATE INDEX IF NOT EXISTS agent_tasks_queued_idx ON agent_tasks (user_id, status, priority);

CREATE TABLE IF NOT EXISTS agent_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allowed_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_apps jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_concurrency integer NOT NULL DEFAULT 1,
  stop_on_captcha boolean NOT NULL DEFAULT true,
  paused boolean NOT NULL DEFAULT false,
  pause_reason varchar(300) NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_policies_user_uq ON agent_policies (user_id);

CREATE TABLE IF NOT EXISTS export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format varchar(16) NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  filters jsonb,
  file_key varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS export_jobs_user_idx ON export_jobs (user_id);