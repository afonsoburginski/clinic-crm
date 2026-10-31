CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Aggregate payloads remain JSONB while indexed identity and clinic scope stay relational.
CREATE TABLE IF NOT EXISTS api_resources (
  clinic_id uuid NOT NULL,
  resource_type text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, resource_type, id)
);
CREATE INDEX IF NOT EXISTS api_resources_lookup ON api_resources (clinic_id, resource_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  clinic_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  action text NOT NULL,
  resource text NOT NULL,
  resource_id text NOT NULL,
  summary text NOT NULL,
  changes jsonb,
  PRIMARY KEY (clinic_id, occurred_at, id)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX IF NOT EXISTS audit_events_timeline ON audit_events (clinic_id, occurred_at DESC, resource, actor_id);

CREATE TABLE IF NOT EXISTS dashboard_daily (
  clinic_id uuid NOT NULL,
  day date NOT NULL,
  professional_id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (clinic_id, day, professional_id)
) PARTITION BY RANGE (day);
CREATE INDEX IF NOT EXISTS dashboard_daily_lookup ON dashboard_daily (clinic_id, day, professional_id);
