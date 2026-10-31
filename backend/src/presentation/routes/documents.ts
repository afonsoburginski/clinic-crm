import { Hono } from "hono";

import type { DocumentUseCases } from "@/application/use-cases/documents";
import { documents } from "@/presentation/composition/documents";
import { actorOf, filtersOf, handle, param } from "@/presentation/routes/context";
import { clinic, type ApiEnv } from "@/presentation/routes/shared";

export function createDocumentsRouter({ queries, commands }: DocumentUseCases) {
  const app = new Hono<ApiEnv>();
  app.post(
    "/api/v1/documents/:id/releases/:releaseId/revoke",
    handle(async (c) =>
      c.json(
        await commands.revokeRelease({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          releaseId: param(c, "releaseId"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.get(
    "/api/v1/documents",
    handle(async (c) =>
      c.json({ items: await queries.listDocuments({ clinicId: clinic()!, actor: actorOf(c), filters: filtersOf(c) }) }),
    ),
  );
  app.post(
    "/api/v1/documents",
    handle(async (c) =>
      c.json(await commands.createDocument({ clinicId: clinic()!, actor: actorOf(c), body: await c.req.json() }), 201),
    ),
  );
  app.get(
    "/api/v1/documents/:id",
    handle(async (c) =>
      c.json(await queries.getDocument({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") })),
    ),
  );
  app.patch(
    "/api/v1/documents/:id",
    handle(async (c) =>
      c.json(
        await commands.updateDocument({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/documents/:id/status",
    handle(async (c) =>
      c.json(
        await commands.changeStatus({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/documents/:id/releases",
    handle(async (c) =>
      c.json(
        await commands.addRelease({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  return app;
}

export const documentsRouter = createDocumentsRouter(documents);
