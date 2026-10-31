import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { pool } from "@/infrastructure/database"
import * as schema from "@/infrastructure/postgres/schema"

export type Database = NodePgDatabase<typeof schema>

/** Drizzle over the single `pg` pool of `infrastructure/database.ts`; there is no second connection pool. */
const database: Database | null = pool ? drizzle(pool, { schema }) : null

export function db(): Database {
  if (!database) throw new Error("database_unconfigured")
  return database
}
