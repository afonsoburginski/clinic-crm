-- Baseline of the Drizzle journal. Everything the snapshot (meta/0000_snapshot.json) describes is already created
-- by the hand-written migrations backend/migrations/001–006, so this migration intentionally changes nothing:
-- it only gives `drizzle-kit migrate` a starting point on a database that was migrated by hand (and on a new one,
-- once 001–006 have been applied). Later `db:generate` runs diff schema.ts against the snapshot and emit
-- incremental statements only.
SELECT 1;
