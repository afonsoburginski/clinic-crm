ALTER TABLE professionals ADD COLUMN email text;
ALTER TABLE professionals ADD COLUMN phone text;
ALTER TABLE professionals ADD COLUMN registry text;
ALTER TABLE professionals ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE professionals ADD COLUMN color_index integer NOT NULL DEFAULT 0;
