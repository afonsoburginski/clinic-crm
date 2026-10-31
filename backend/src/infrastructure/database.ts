import { Pool } from "pg"

const connectionString = Bun.env.DATABASE_URL

export const pool = connectionString
  ? new Pool({ connectionString, max: Number(Bun.env.DATABASE_POOL_SIZE ?? 10) })
  : null

export async function query<T extends object>(text: string, values: unknown[] = []) {
  if (!pool) throw new Error("database_unconfigured")
  return pool.query<T>(text, values)
}

export async function databaseReady() {
  if (!pool) return false
  try {
    await pool.query("SELECT 1")
    return true
  } catch {
    return false
  }
}
