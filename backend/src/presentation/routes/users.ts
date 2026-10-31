import { Hono } from "hono"

import type { UserUseCases } from "@/application/use-cases/users"
import { users } from "@/presentation/composition/users"
import { actorOf, handle, param } from "@/presentation/routes/context"
import { clinic, type ApiEnv } from "@/presentation/routes/shared"

export function createUsersRouter({ queries, commands }: UserUseCases) {
  const app = new Hono<ApiEnv>()
  app.get(
    "/api/v1/users",
    handle(async (c) => c.json({ items: await queries.listUsers({ clinicId: clinic()! }) })),
  )
  app.post(
    "/api/v1/users",
    handle(async (c) =>
      c.json(await commands.createUser({ clinicId: clinic()!, actor: actorOf(c), body: await c.req.json() }), 201),
    ),
  )
  app.get(
    "/api/v1/users/:id",
    handle(async (c) => c.json(await queries.getUser({ clinicId: clinic()!, id: param(c, "id") }))),
  )
  app.patch(
    "/api/v1/users/:id",
    handle(async (c) =>
      c.json(
        await commands.updateUser({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  )
  app.delete(
    "/api/v1/users/:id",
    handle(async (c) =>
      c.json(await commands.deactivateUser({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") })),
    ),
  )
  app.put(
    "/api/v1/users/:id/roles",
    handle(async (c) =>
      c.json(
        await commands.setUserRoles({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  )
  app.post(
    "/api/v1/users/:id/password",
    handle(async (c) =>
      c.json(
        await commands.resetPassword({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  )
  app.get(
    "/api/v1/roles",
    handle(async (c) => c.json({ items: await queries.listRoles({ clinicId: clinic()! }) })),
  )
  app.put(
    "/api/v1/roles/:key/permissions",
    handle(async (c) =>
      c.json(
        await commands.setRolePermissions({
          clinicId: clinic()!,
          actor: actorOf(c),
          roleKey: param(c, "key"),
          body: await c.req.json(),
        }),
      ),
    ),
  )
  app.get(
    "/api/v1/permissions",
    handle(async (c) => c.json({ items: await queries.listPermissions() })),
  )
  return app
}

export const usersRouter = createUsersRouter(users)
