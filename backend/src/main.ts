import { app } from "./presentation/app"

const port = Number(Bun.env.PORT ?? 3001)

export default {
  port,
  fetch: app.fetch,
}
