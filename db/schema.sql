-- ============================================================
-- RIVU by WaterTing — PostgreSQL Schema
-- Version: 1.0.0
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ──────────────────────────────────────────────
-- ENUMS
-- ──────────────────────────────────────────────

CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');
CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
CREATE TYPE dataset_status AS ENUM ('uploading', 'uploaded', 'processing', 'profiled', 'analyzed', 'transformed', 'failed', 'archived');
CREATE TYPE job_status AS ENUM ('queued', 'processing', 'profiling', 'ai_analysis', 'transformation', 'validation', 'completed', 'failed', 'cancelled');
CREATE TYPE job_type AS ENUM ('profile', 'quality_analysis', 'ai_analysis', 'transformation', 'validation', 'export');
CREATE TYPE column_semantic_type AS ENUM (
  'string', 'integer', 'float', 'boolean', 'date', 'datetime', 'timestamp',
  'email', 'phone', 'currency', 'url', 'id_like', 'categorical',
  'text', 'json', 'array', 'unknown'
);
CREATE TYPE issue_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');
CREATE TYPE issue_type AS ENUM (
  'missing_values', 'invalid_type', 'invalid_format', 'inconsistent_format',
  'inconsistent_capitalization', 'whitespace', 'duplicate_rows', 'duplicate_values',
  'outlier', 'impossible_value', 'malformed_email', 'malformed_phone',
  'currency_inconsistency', 'date_format_inconsistency', 'category_inconsistency',
  'schema_inconsistency', 'constant_column', 'high_cardinality', 'suspicious_pattern'
);
CREATE TYPE transformation_op_type AS ENUM (
  'trim_whitespace', 'normalize_whitespace', 'lowercase', 'uppercase', 'title_case',
  'standardize_date', 'standardize_datetime', 'coerce_numeric', 'coerce_boolean',
  'normalize_currency', 'normalize_phone', 'normalize_email', 'normalize_category',
  'fill_null', 'drop_nulls', 'remove_duplicates', 'flag_duplicates',
  'flag_outliers', 'replace_value', 'regex_replace', 'clip_numeric',
  'drop_column', 'rename_column', 'reorder_columns', 'cast_type'
);
CREATE TYPE transformation_status AS ENUM ('planned', 'previewed', 'approved', 'rejected', 'running', 'completed', 'failed');
CREATE TYPE ai_provider AS ENUM ('groq', 'openai', 'gemini', 'anthropic', 'local');
CREATE TYPE export_format AS ENUM ('csv', 'parquet', 'json', 'xlsx');
CREATE TYPE audit_action AS ENUM (
  'create', 'read', 'update', 'delete', 'upload', 'download', 'export',
  'transform', 'approve', 'reject', 'login', 'logout', 'signup'
);
CREATE TYPE db_recommendation AS ENUM (
  'postgresql', 'mysql', 'mongodb', 'cassandra', 'redis', 'elasticsearch',
  'bigquery', 'snowflake', 'duckdb', 'sqlite', 'dynamodb'
);

-- ──────────────────────────────────────────────
-- CORE IDENTITY
-- ──────────────────────────────────────────────

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(320) NOT NULL UNIQUE,
  username      VARCHAR(50) NOT NULL UNIQUE,
  full_name     VARCHAR(200),
  password_hash TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  refresh_token_version INTEGER NOT NULL DEFAULT 0,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_token_hash VARCHAR(64) UNIQUE,
  email_verification_expires_at TIMESTAMPTZ,
  password_reset_token_hash VARCHAR(64) UNIQUE,
  password_reset_expires_at TIMESTAMPTZ,
  status        user_status NOT NULL DEFAULT 'active',
  avatar_url    TEXT,
  google_id     VARCHAR(255) UNIQUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_google_id ON users(google_id);

CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  plan        VARCHAR(50) NOT NULL DEFAULT 'free',
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_owner ON organizations(owner_id);

CREATE TABLE memberships (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            membership_role NOT NULL DEFAULT 'viewer',
  invited_by      UUID REFERENCES users(id),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_memberships_org ON memberships(organization_id);
CREATE INDEX idx_memberships_user ON memberships(user_id);

CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  key_prefix      VARCHAR(10) NOT NULL,
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- PROJECTS
-- ──────────────────────────────────────────────

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES users(id),
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  color           VARCHAR(7) DEFAULT '#6366f1',
  tags            TEXT[] DEFAULT '{}',
  settings        JSONB NOT NULL DEFAULT '{}',
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_projects_created_by ON projects(created_by);

-- ──────────────────────────────────────────────
-- DATASETS & VERSIONS
-- ──────────────────────────────────────────────

CREATE TABLE data_sources (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES users(id),
  name            VARCHAR(300) NOT NULL,
  description     TEXT,
  original_filename VARCHAR(500) NOT NULL,
  file_format     VARCHAR(20) NOT NULL,  -- csv, xlsx, json
  status          VARCHAR(50) NOT NULL DEFAULT 'uploading',
  current_version INTEGER NOT NULL DEFAULT 1,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_sources_org ON data_sources(organization_id);
CREATE INDEX idx_data_sources_project ON data_sources(project_id);

CREATE TABLE dataset_versions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_source_id    UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,
  version_label     VARCHAR(100),  -- 'raw', 'cleaned_v1', etc.
  description       TEXT,
  -- Storage references (never store raw data in PG)
  storage_key       TEXT NOT NULL,  -- S3 object key
  storage_bucket    TEXT NOT NULL,
  file_format       VARCHAR(20) NOT NULL,  -- csv, parquet, json
  file_size_bytes   BIGINT,
  row_count         INTEGER,
  column_count      INTEGER,
  checksum          TEXT,           -- SHA-256 of file
  -- Derived from previous version
  parent_version_id UUID REFERENCES dataset_versions(id),
  transformation_run_id UUID,       -- set after transform
  -- Quality summary (cached)
  quality_score     NUMERIC(5,2),
  quality_delta     NUMERIC(5,2),   -- compared to parent
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(data_source_id, version_number)
);

CREATE INDEX idx_dataset_versions_source ON dataset_versions(data_source_id);
CREATE INDEX idx_dataset_versions_org ON dataset_versions(organization_id);

-- ──────────────────────────────────────────────
-- PROFILING
-- ──────────────────────────────────────────────

CREATE TABLE data_profiles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_version_id    UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Overall stats
  row_count             INTEGER NOT NULL DEFAULT 0,
  column_count          INTEGER NOT NULL DEFAULT 0,
  duplicate_row_count   INTEGER NOT NULL DEFAULT 0,
  duplicate_row_pct     NUMERIC(6,3),
  total_null_count      BIGINT NOT NULL DEFAULT 0,
  total_null_pct        NUMERIC(6,3),
  total_cell_count      BIGINT NOT NULL DEFAULT 0,
  -- File metadata
  encoding              VARCHAR(50),
  delimiter             VARCHAR(10),
  has_header            BOOLEAN DEFAULT TRUE,
  sample_rows           JSONB,       -- first 20 rows for preview
  -- Profiling metadata
  profiled_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  profiling_duration_ms INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_profiles_version ON data_profiles(dataset_version_id);

CREATE TABLE column_profiles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_profile_id     UUID NOT NULL REFERENCES data_profiles(id) ON DELETE CASCADE,
  dataset_version_id  UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Column identity
  column_index        INTEGER NOT NULL,
  column_name         VARCHAR(300) NOT NULL,
  -- Type detection
  inferred_type       VARCHAR(50),
  semantic_type       VARCHAR(50) NOT NULL DEFAULT 'unknown',
  ai_semantic_type    VARCHAR(100),
  ai_semantic_reason  TEXT,
  -- Null stats
  null_count          INTEGER NOT NULL DEFAULT 0,
  null_pct            NUMERIC(6,3),
  non_null_count      INTEGER NOT NULL DEFAULT 0,
  -- Unique stats
  unique_count        INTEGER,
  uniqueness_pct      NUMERIC(6,3),
  is_constant         BOOLEAN DEFAULT FALSE,
  is_unique           BOOLEAN DEFAULT FALSE,
  -- Numeric stats (if applicable)
  numeric_min         NUMERIC,
  numeric_max         NUMERIC,
  numeric_mean        NUMERIC,
  numeric_median      NUMERIC,
  numeric_std_dev     NUMERIC,
  numeric_q1          NUMERIC,
  numeric_q3          NUMERIC,
  numeric_skewness    NUMERIC,
  -- String stats
  string_min_length   INTEGER,
  string_max_length   INTEGER,
  string_avg_length   NUMERIC,
  -- Date stats
  date_min            TEXT,
  date_max            TEXT,
  date_formats        TEXT[],
  -- Distributions
  value_frequency     JSONB,   -- top-N value counts
  sample_values       TEXT[],  -- up to 10 representative values
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_column_profiles_profile ON column_profiles(data_profile_id);
CREATE INDEX idx_column_profiles_version ON column_profiles(dataset_version_id);

-- ──────────────────────────────────────────────
-- QUALITY
-- ──────────────────────────────────────────────

CREATE TABLE quality_reports (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_version_id    UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Scores (0-100)
  overall_score         NUMERIC(5,2) NOT NULL DEFAULT 0,
  completeness_score    NUMERIC(5,2),
  validity_score        NUMERIC(5,2),
  consistency_score     NUMERIC(5,2),
  uniqueness_score      NUMERIC(5,2),
  integrity_score       NUMERIC(5,2),
  -- Weights used
  completeness_weight   NUMERIC(4,2) DEFAULT 0.25,
  validity_weight       NUMERIC(4,2) DEFAULT 0.25,
  consistency_weight    NUMERIC(4,2) DEFAULT 0.20,
  uniqueness_weight     NUMERIC(4,2) DEFAULT 0.15,
  integrity_weight      NUMERIC(4,2) DEFAULT 0.15,
  -- Summary
  total_issues          INTEGER NOT NULL DEFAULT 0,
  critical_issues       INTEGER NOT NULL DEFAULT 0,
  high_issues           INTEGER NOT NULL DEFAULT 0,
  medium_issues         INTEGER NOT NULL DEFAULT 0,
  low_issues            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_reports_version ON quality_reports(dataset_version_id);

CREATE TABLE quality_issues (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quality_report_id   UUID NOT NULL REFERENCES quality_reports(id) ON DELETE CASCADE,
  dataset_version_id  UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  issue_type          VARCHAR(100) NOT NULL,
  severity            VARCHAR(20) NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  affected_column     VARCHAR(300),
  affected_row_count  INTEGER,
  affected_row_pct    NUMERIC(6,3),
  evidence            JSONB,        -- sample bad values, examples
  suggested_fix       TEXT,
  auto_fixable        BOOLEAN DEFAULT FALSE,
  issue_id            VARCHAR(64),
  category            VARCHAR(80),
  status              VARCHAR(20) NOT NULL DEFAULT 'open',
  resolved_at         TIMESTAMPTZ,
  resolution_note     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_issues_report ON quality_issues(quality_report_id);
CREATE INDEX idx_quality_issues_column ON quality_issues(affected_column);
CREATE INDEX idx_quality_issues_status ON quality_issues(status);
CREATE INDEX idx_quality_issues_issue_id ON quality_issues(issue_id);

-- ──────────────────────────────────────────────
-- AI ANALYSIS & TRANSFORMATION
-- ──────────────────────────────────────────────

CREATE TABLE ai_analyses (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_version_id  UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider            ai_provider NOT NULL DEFAULT 'groq',
  model               VARCHAR(100) NOT NULL,
  prompt_version      VARCHAR(20) NOT NULL DEFAULT '1.0',
  -- Semantic understanding
  dataset_summary     TEXT,
  detected_domain     VARCHAR(100),
  entity_types        TEXT[],
  key_relationships   JSONB,
  -- Column semantics
  column_semantics    JSONB,    -- {col_name: {type, reason, confidence}}
  -- Issues interpretation
  issue_interpretations JSONB,
  -- Usage tracking
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  latency_ms          INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transformation_plans (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_version_id  UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  ai_analysis_id      UUID REFERENCES ai_analyses(id),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES users(id),
  -- Plan metadata
  plan_version        VARCHAR(20) NOT NULL DEFAULT '1.0',
  status              VARCHAR(50) NOT NULL DEFAULT 'planned',
  operations          JSONB NOT NULL DEFAULT '[]',  -- ordered list of ops
  total_operations    INTEGER NOT NULL DEFAULT 0,
  estimated_quality_gain NUMERIC(5,2),
  -- Approval tracking
  approved_by         UUID REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  rejected_by         UUID REFERENCES users(id),
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transformation_plans_version ON transformation_plans(dataset_version_id);

CREATE TABLE transformation_runs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transformation_plan_id UUID NOT NULL REFERENCES transformation_plans(id) ON DELETE CASCADE,
  dataset_version_id    UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  output_version_id     UUID REFERENCES dataset_versions(id),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  executed_by           UUID NOT NULL REFERENCES users(id),
  status                VARCHAR(50) NOT NULL DEFAULT 'running',
  -- Results
  operations_total      INTEGER NOT NULL DEFAULT 0,
  operations_applied    INTEGER NOT NULL DEFAULT 0,
  operations_skipped    INTEGER NOT NULL DEFAULT 0,
  operations_failed     INTEGER NOT NULL DEFAULT 0,
  rows_modified         INTEGER,
  quality_before        NUMERIC(5,2),
  quality_after         NUMERIC(5,2),
  quality_delta         NUMERIC(5,2),
  -- Execution log
  execution_log         JSONB DEFAULT '[]',
  error_message         TEXT,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  duration_ms           INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transformation_runs_plan ON transformation_runs(transformation_plan_id);
CREATE INDEX idx_transformation_runs_org ON transformation_runs(organization_id);

-- ──────────────────────────────────────────────
-- SCHEMA INTELLIGENCE
-- ──────────────────────────────────────────────

CREATE TABLE schema_analyses (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_version_id  UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Inferred schema
  detected_entities   JSONB DEFAULT '[]',
  pk_candidates       TEXT[],
  fk_candidates       JSONB DEFAULT '[]',
  suggested_schema    JSONB,
  normalization_form  VARCHAR(10),  -- 1NF, 2NF, 3NF
  -- DB recommendation
  recommended_db      db_recommendation,
  db_confidence       NUMERIC(5,2),
  db_reasoning        TEXT,
  db_tradeoffs        JSONB,
  db_scores           JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- ANALYTICS
-- ──────────────────────────────────────────────

CREATE TABLE analytics_queries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_version_id  UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES users(id),
  -- Query
  natural_language    TEXT NOT NULL,
  generated_sql       TEXT,
  validated_sql       TEXT,
  -- Result
  result_rows         INTEGER,
  result_data         JSONB,
  chart_type          VARCHAR(50),
  chart_config        JSONB,
  -- Execution
  is_safe             BOOLEAN DEFAULT FALSE,
  execution_ms        INTEGER,
  error_message       TEXT,
  -- AI
  provider            ai_provider DEFAULT 'groq',
  model               VARCHAR(100),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_queries_version ON analytics_queries(dataset_version_id);
CREATE INDEX idx_analytics_queries_org ON analytics_queries(organization_id);

CREATE TABLE dashboards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES users(id),
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  layout          JSONB DEFAULT '[]',
  widgets         JSONB DEFAULT '[]',
  is_public       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- AI CONVERSATIONS
-- ──────────────────────────────────────────────

CREATE TABLE ai_conversations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_version_id  UUID REFERENCES dataset_versions(id) ON DELETE SET NULL,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               VARCHAR(300),
  context             JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role              VARCHAR(20) NOT NULL,  -- user, assistant, system
  content           TEXT NOT NULL,
  metadata          JSONB DEFAULT '{}',
  -- SQL result if analytics
  generated_sql     TEXT,
  result_data       JSONB,
  chart_config      JSONB,
  -- Token tracking
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id);

-- ──────────────────────────────────────────────
-- JOB SYSTEM
-- ──────────────────────────────────────────────

CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by        UUID REFERENCES users(id),
  job_type          VARCHAR(50) NOT NULL,
  status            VARCHAR(50) NOT NULL DEFAULT 'queued',
  -- Reference to what this job processes
  data_source_id    UUID REFERENCES data_sources(id) ON DELETE SET NULL,
  dataset_version_id UUID REFERENCES dataset_versions(id) ON DELETE SET NULL,
  transformation_plan_id UUID REFERENCES transformation_plans(id) ON DELETE SET NULL,
  -- Execution
  priority          INTEGER NOT NULL DEFAULT 5,
  attempts          INTEGER NOT NULL DEFAULT 0,
  max_attempts      INTEGER NOT NULL DEFAULT 3,
  progress_pct      INTEGER DEFAULT 0,
  progress_message  TEXT,
  result            JSONB,
  error_message     TEXT,
  error_traceback   TEXT,
  -- Timing
  queued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  duration_ms       INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_org ON jobs(organization_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_data_source ON jobs(data_source_id);

CREATE TABLE job_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  level       VARCHAR(10) NOT NULL DEFAULT 'INFO',  -- DEBUG, INFO, WARNING, ERROR
  message     TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_logs_job ON job_logs(job_id);

-- ──────────────────────────────────────────────
-- EXPORTS
-- ──────────────────────────────────────────────

CREATE TABLE exports (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_version_id  UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES users(id),
  format              export_format NOT NULL,
  storage_key         TEXT NOT NULL,
  storage_bucket      TEXT NOT NULL,
  file_size_bytes     BIGINT,
  download_count      INTEGER NOT NULL DEFAULT 0,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- GOVERNANCE & AUDIT
-- ──────────────────────────────────────────────

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          audit_action NOT NULL,
  resource_type   VARCHAR(100),
  resource_id     UUID,
  ip_address      INET,
  user_agent      TEXT,
  details         JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

CREATE TABLE usage_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),
  metric          VARCHAR(100) NOT NULL,   -- api_calls, ai_tokens, storage_bytes
  value           BIGINT NOT NULL DEFAULT 0,
  period          DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, metric, period)
);

-- ──────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ──────────────────────────────────────────────

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_data_sources_updated_at BEFORE UPDATE ON data_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transformation_plans_updated_at BEFORE UPDATE ON transformation_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dashboards_updated_at BEFORE UPDATE ON dashboards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_conversations_updated_at BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ──────────────────────────────────────────────
-- E-COMMERCE DATA INTELLIGENCE & BUSINESS OPERATIONS
-- ──────────────────────────────────────────────

CREATE TABLE subscription_plans (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                  VARCHAR(50) NOT NULL UNIQUE,
  name                  VARCHAR(100) NOT NULL,
  description           VARCHAR(500),
  monthly_price_inr     INTEGER NOT NULL,
  annual_price_inr      INTEGER,
  currency              VARCHAR(10) DEFAULT 'INR',
  sku_limit             INTEGER DEFAULT 1000,
  monthly_rows_limit    INTEGER DEFAULT 50000,
  max_file_size_mb      INTEGER DEFAULT 100,
  user_seats_limit      INTEGER DEFAULT 3,
  catalogues_limit      INTEGER DEFAULT 5,
  channels_limit        INTEGER DEFAULT 1,
  ai_enrichment_credits INTEGER DEFAULT 250,
  api_access            BOOLEAN DEFAULT FALSE,
  custom_integrations   BOOLEAN DEFAULT FALSE,
  support_tier          VARCHAR(50) DEFAULT 'standard',
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscription_plans_code ON subscription_plans(code);

CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id                 UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status                  VARCHAR(50) NOT NULL DEFAULT 'trial',
  billing_cycle           VARCHAR(20) DEFAULT 'monthly',
  current_period_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end      TIMESTAMPTZ NOT NULL,
  cancel_at_period_end    BOOLEAN DEFAULT FALSE,
  canceled_at             TIMESTAMPTZ,
  custom_price_inr        INTEGER,
  custom_sku_limit        INTEGER,
  custom_rows_limit       INTEGER,
  custom_ai_credits       INTEGER,
  gateway_provider        VARCHAR(50) DEFAULT 'razorpay',
  gateway_subscription_id VARCHAR(100),
  gateway_customer_id     VARCHAR(100),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

CREATE TABLE usage_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type      VARCHAR(50) NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  idempotency_key VARCHAR(120) UNIQUE,
  metadata_info   JSONB DEFAULT '{}',
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_events_org ON usage_events(organization_id);
CREATE INDEX idx_usage_events_type ON usage_events(event_type);

CREATE TABLE invoices (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id  UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  invoice_number   VARCHAR(100) NOT NULL UNIQUE,
  customer_name    VARCHAR(200) NOT NULL,
  customer_email   VARCHAR(320) NOT NULL,
  customer_gstin   VARCHAR(20),
  customer_address VARCHAR(500),
  provider_gstin   VARCHAR(20),
  subtotal_inr     NUMERIC(12, 2) NOT NULL,
  cgst_inr         NUMERIC(12, 2) DEFAULT 0.0,
  sgst_inr         NUMERIC(12, 2) DEFAULT 0.0,
  igst_inr         NUMERIC(12, 2) DEFAULT 0.0,
  total_inr        NUMERIC(12, 2) NOT NULL,
  status           VARCHAR(50) DEFAULT 'issued',
  due_date         TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  pdf_url          VARCHAR(500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);

CREATE TABLE payments (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id    UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  invoice_id         UUID REFERENCES invoices(id) ON DELETE SET NULL,
  amount_inr         NUMERIC(12, 2) NOT NULL,
  currency           VARCHAR(10) DEFAULT 'INR',
  status             VARCHAR(50) DEFAULT 'pending',
  gateway_provider   VARCHAR(50) DEFAULT 'razorpay',
  gateway_payment_id VARCHAR(100) UNIQUE,
  gateway_order_id   VARCHAR(100),
  gateway_signature  VARCHAR(255),
  failure_reason     VARCHAR(500),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_payments_gateway_id ON payments(gateway_payment_id);

CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  code            VARCHAR(50) NOT NULL,
  contact_name    VARCHAR(150),
  contact_email   VARCHAR(320),
  contact_phone   VARCHAR(50),
  website         VARCHAR(255),
  default_format  VARCHAR(50) DEFAULT 'csv',
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_org ON suppliers(organization_id);
CREATE INDEX idx_suppliers_code ON suppliers(code);

CREATE TABLE supplier_mapping_recipes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id      UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name             VARCHAR(100) NOT NULL,
  source_columns   JSONB DEFAULT '[]',
  mapping_rules    JSONB DEFAULT '{}',
  confidence_score FLOAT DEFAULT 1.0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_recipes_org ON supplier_mapping_recipes(organization_id);
CREATE INDEX idx_supplier_recipes_supplier ON supplier_mapping_recipes(supplier_id);

CREATE TABLE products (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id           UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  sku                   VARCHAR(100) NOT NULL,
  parent_sku            VARCHAR(100),
  barcode               VARCHAR(100),
  supplier_sku          VARCHAR(100),
  brand                 VARCHAR(100),
  manufacturer          VARCHAR(150),
  model                 VARCHAR(100),
  title                 VARCHAR(500) NOT NULL,
  short_description     TEXT,
  description           TEXT,
  category              VARCHAR(200),
  subcategory           VARCHAR(200),
  tags                  JSONB DEFAULT '[]',
  material              VARCHAR(100),
  colour                VARCHAR(50),
  size                  VARCHAR(50),
  weight_kg             FLOAT,
  dimensions_cm         VARCHAR(100),
  custom_attributes     JSONB DEFAULT '{}',
  mrp                   NUMERIC(12, 2),
  selling_price         NUMERIC(12, 2),
  cost_price            NUMERIC(12, 2),
  currency              VARCHAR(10) DEFAULT 'INR',
  tax_rate              FLOAT,
  stock_quantity        INTEGER DEFAULT 0,
  inventory_status      VARCHAR(50) DEFAULT 'in_stock',
  primary_image_url     VARCHAR(1000),
  additional_image_urls JSONB DEFAULT '[]',
  is_valid              BOOLEAN DEFAULT TRUE,
  validation_errors     JSONB DEFAULT '[]',
  validation_warnings   JSONB DEFAULT '[]',
  completeness_score    FLOAT DEFAULT 100.0,
  is_approved           BOOLEAN DEFAULT FALSE,
  is_archived           BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_org ON products(organization_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_category ON products(category);

CREATE TABLE product_variants (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_sku       VARCHAR(100) NOT NULL,
  barcode           VARCHAR(100),
  title             VARCHAR(255),
  option1_name      VARCHAR(50),
  option1_value     VARCHAR(50),
  option2_name      VARCHAR(50),
  option2_value     VARCHAR(50),
  selling_price     NUMERIC(12, 2),
  mrp               NUMERIC(12, 2),
  stock_quantity    INTEGER DEFAULT 0,
  image_url         VARCHAR(1000),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_variants_product ON product_variants(parent_product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(variant_sku);

CREATE TABLE channel_connections (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_type           VARCHAR(50) NOT NULL,
  name                   VARCHAR(150) NOT NULL,
  store_url              VARCHAR(255) NOT NULL,
  access_token_encrypted TEXT,
  api_key_encrypted      TEXT,
  api_secret_encrypted   TEXT,
  webhook_secret         VARCHAR(255),
  status                 VARCHAR(50) DEFAULT 'disconnected',
  last_sync_at           TIMESTAMPTZ,
  sync_settings          JSONB DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channel_conn_org ON channel_connections(organization_id);

CREATE TABLE channel_product_listings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_connection_id UUID NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  external_product_id   VARCHAR(150),
  listing_status        VARCHAR(50) DEFAULT 'draft',
  sync_status           VARCHAR(50) DEFAULT 'pending',
  last_error            TEXT,
  last_synced_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channel_listings_conn ON channel_product_listings(channel_connection_id);
CREATE INDEX idx_channel_listings_prod ON channel_product_listings(product_id);

CREATE TABLE custom_solution_projects (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                            VARCHAR(200) NOT NULL,
  client_contact_name             VARCHAR(150),
  client_contact_email            VARCHAR(320),
  sku_volume_estimate             INTEGER DEFAULT 5000,
  data_sources                    JSONB DEFAULT '[]',
  target_platforms                JSONB DEFAULT '[]',
  one_time_implementation_fee_inr INTEGER DEFAULT 50000,
  monthly_subscription_fee_inr    INTEGER DEFAULT 14999,
  status                          VARCHAR(50) DEFAULT 'inquiry',
  deliverables                    JSONB DEFAULT '[]',
  timeline_weeks                  INTEGER DEFAULT 4,
  assigned_lead_engineer          VARCHAR(150),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_custom_projects_org ON custom_solution_projects(organization_id);
CREATE INDEX idx_custom_projects_status ON custom_solution_projects(status);

CREATE TABLE project_milestones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID NOT NULL REFERENCES custom_solution_projects(id) ON DELETE CASCADE,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  status       VARCHAR(50) DEFAULT 'pending',
  target_date  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_milestones_proj ON project_milestones(project_id);

CREATE TABLE leads (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name                 VARCHAR(200) NOT NULL,
  contact_person               VARCHAR(150) NOT NULL,
  email                        VARCHAR(320) NOT NULL,
  phone                        VARCHAR(50),
  business_type                VARCHAR(100) DEFAULT 'distributor',
  sku_volume_estimate          INTEGER DEFAULT 1000,
  selling_channels             JSONB DEFAULT '[]',
  source_channel               VARCHAR(100),
  problem_description          TEXT,
  pipeline_stage               VARCHAR(50) DEFAULT 'lead_identified',
  estimated_contract_value_inr INTEGER DEFAULT 0,
  interest_level               VARCHAR(50) DEFAULT 'medium',
  next_follow_up               TIMESTAMPTZ,
  owner                        VARCHAR(100),
  notes                        TEXT,
  lost_reason                  VARCHAR(255),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_company ON leads(company_name);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_stage ON leads(pipeline_stage);
