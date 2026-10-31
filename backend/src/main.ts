import { runMigrations } from "@/infrastructure/postgres/migrate"
import { app } from "@/presentation/app"

const port = Number(Bun.env.PORT ?? 3001)

await runMigrations()

export default {
  port,
  fetch: app.fetch,
}
