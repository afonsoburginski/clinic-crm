CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_expiry ON auth_sessions(user_id, expires_at);
CREATE TABLE auth_login_lockouts (
  email_hash text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);
