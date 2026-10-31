import { defineConfig } from "drizzle-kit"

/**
 * `backend/migrations/00N_*.sql` are hand-written and applied in order (001–006); they own the tables that exist.
 * Drizzle-managed migrations live in `migrations/drizzle/`, journaled from a baseline that is already applied by
 * those SQL files, so `db:migrate` never recreates an existing table (see README, "Migrações").
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/postgres/schema.ts",
  out: "./migrations/drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  migrations: { table: "__drizzle_migrations", schema: "public" },
})
