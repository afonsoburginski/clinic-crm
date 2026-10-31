import { Hono } from "hono"

import type { TablePreferenceUseCases } from "@/application/use-cases/table-preferences"
import { tablePreferences } from "@/presentation/composition/table-preferences"
import { actorOf, handle, param } from "@/presentation/routes/context"
import { clinic, type ApiEnv } from "@/presentation/routes/shared"

/** Always the signed-in user's own views: the user comes from the session, never from the URL. */
export function createTablePreferencesRouter({ queries, commands }: TablePreferenceUseCases) {
  const app = new Hono<ApiEnv>()
  app.get(
    "/api/v1/preferences/tables/:key",
    handle(async (c) =>
      c.json({ items: await queries.listViews({ clinicId: clinic()!, actor: actorOf(c), tableKey: param(c, "key") }) }),
    ),
  )
  app.put(
    "/api/v1/preferences/tables/:key/views/:name",
    handle(async (c) =>
      c.json(
        await commands.saveView({
          clinicId: clinic()!,
          actor: actorOf(c),
          tableKey: param(c, "key"),
          viewName: param(c, "name"),
          body: await c.req.json().catch(() => {
            throw new Error("validation")
          }),
        }),
      ),
    ),
  )
  app.delete(
    "/api/v1/preferences/tables/:key/views/:name",
    handle(async (c) =>
      c.json(
        await commands.deleteView({
          clinicId: clinic()!,
          actor: actorOf(c),
          tableKey: param(c, "key"),
          viewName: param(c, "name"),
        }),
      ),
    ),
  )
  return app
}

export const tablePreferencesRouter = createTablePreferencesRouter(tablePreferences)
