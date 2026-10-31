-- Per-user saved views of the data tables (page size, sort, columns, filters). Always scoped to the signed-in
-- user; `view_name = 'default'` holds the working preferences, any other name is an explicit saved view, and at
-- most one view per table is flagged as the one that opens first.
CREATE TABLE IF NOT EXISTS user_table_preferences (
  clinic_id uuid NOT NULL,
  user_id uuid NOT NULL,
  table_key text NOT NULL CONSTRAINT user_table_preferences_key_check CHECK (table_key ~ '^[a-z0-9-]{1,60}$'),
  view_name text NOT NULL DEFAULT 'default' CONSTRAINT user_table_preferences_view_check CHECK (length(trim(view_name)) BETWEEN 1 AND 40),
  page_size integer CONSTRAINT user_table_preferences_page_size_check CHECK (page_size IS NULL OR page_size BETWEEN 1 AND 200),
  sort jsonb NOT NULL DEFAULT '[]'::jsonb,
  hidden_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  column_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, user_id, table_key, view_name),
  CONSTRAINT user_table_preferences_user_fk FOREIGN KEY (clinic_id, user_id) REFERENCES users (clinic_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS user_table_preferences_one_default
  ON user_table_preferences (clinic_id, user_id, table_key) WHERE is_default;
