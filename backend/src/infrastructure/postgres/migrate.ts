import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { pool } from "@/infrastructure/database"

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations")
const LOCK_KEY = 727_001
/** Bases created before this runner existed already hold these files; they are recorded, not re-run. */
const LEGACY_BASELINE = 5

/** Applies pending `migrations/NNN_*.sql` in order, once each, under an advisory lock (safe with several instances). */
export async function runMigrations(): Promise<void> {
  if (!pool) return
  const client = await pool.connect()
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY])
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
    const done = new Set<string>((await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name))
    if (done.size === 0) {
      const legacy = await client.query("SELECT to_regclass('public.patients') AS t")
      if (legacy.rows[0]?.t) {
        for (const name of files.slice(0, LEGACY_BASELINE)) {
          await client.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [name])
          done.add(name)
        }
      }
    }
    for (const name of files) {
      if (done.has(name)) continue
      const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8")
      try {
        await client.query("BEGIN")
        await client.query(sql)
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name])
        await client.query("COMMIT")
        console.log(`migration applied: ${name}`)
      } catch (error) {
        await client.query("ROLLBACK")
        throw new Error(`migration ${name} failed: ${(error as Error).message}`)
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {})
    client.release()
  }
}
