import { Hono, type Context } from "hono";

import type { CatalogKind } from "@/application/ports/catalog";
import type { CatalogUseCases } from "@/application/use-cases/catalog";
import { catalog } from "@/presentation/composition/catalog";
import { clinic, run, type ApiEnv } from "@/presentation/routes/shared";

const handle = (fn: (c: Context<ApiEnv>) => Promise<Response>) => run(fn);
// The route patterns below always carry the segment.
const param = (c: Context<ApiEnv>, name: string): string => c.req.param(name)!;

const collections: ReadonlyArray<readonly [path: string, kind: CatalogKind]> = [
  ["specialties", "specialty"],
  ["services", "service"],
  ["rooms", "room"],
  ["professionals", "professional"],
];

export function createCatalogRouter({ queries, commands }: CatalogUseCases) {
  const app = new Hono<ApiEnv>();
  app.put(
    "/api/v1/professionals/:id/schedule",
    handle(async (c) =>
      c.json(
        await commands.updateProfessionalSchedule({
          clinicId: clinic()!,
          professionalId: param(c, "id"),
          actorId: c.get("auth").userId,
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/professionals/:id/unavailabilities",
    handle(async (c) =>
      c.json(
        await commands.addProfessionalUnavailability({
          clinicId: clinic()!,
          professionalId: param(c, "id"),
          actorId: c.get("auth").userId,
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.delete(
    "/api/v1/professionals/:id/unavailabilities/:unavailabilityId",
    handle(async (c) =>
      c.json(
        await commands.removeProfessionalUnavailability({
          clinicId: clinic()!,
          professionalId: param(c, "id"),
          actorId: c.get("auth").userId,
          unavailabilityId: param(c, "unavailabilityId"),
        }),
      ),
    ),
  );
  app.get(
    "/api/v1/settings",
    handle(async (c) => c.json(await queries.getSettings({ clinicId: clinic()! }))),
  );
  app.put(
    "/api/v1/settings",
    handle(async (c) =>
      c.json(
        await commands.saveSettings({ clinicId: clinic()!, actorId: c.get("auth").userId, body: await c.req.json() }),
      ),
    ),
  );
  app.get(
    "/api/v1/audit",
    handle(async (c) =>
      c.json({
        items: await queries.listAuditEvents({
          clinicId: clinic()!,
          resource: c.req.query("resource"),
          actorId: c.req.query("actorId"),
        }),
      }),
    ),
  );
  for (const [path, kind] of collections) {
    const base = `/api/v1/${path}`;
    app.get(
      base,
      handle(async (c) =>
        c.json({
          items: await queries.listItems({
            clinicId: clinic()!,
            kind,
            filters: {
              patientId: c.req.query("patientId"),
              status: c.req.query("status"),
              from: c.req.query("from"),
              to: c.req.query("to"),
            },
          }),
        }),
      ),
    );
    app.post(
      base,
      handle(async (c) =>
        c.json(
          await commands.createItem({
            clinicId: clinic()!,
            kind,
            actorId: c.get("auth").userId,
            body: await c.req.json(),
          }),
          201,
        ),
      ),
    );
    app.get(
      `${base}/:id`,
      handle(async (c) => c.json(await queries.getItem({ clinicId: clinic()!, kind, id: param(c, "id") }))),
    );
    app.patch(
      `${base}/:id`,
      handle(async (c) =>
        c.json(
          await commands.updateItem({
            clinicId: clinic()!,
            kind,
            id: param(c, "id"),
            actorId: c.get("auth").userId,
            body: await c.req.json(),
          }),
        ),
      ),
    );
  }
  return app;
}

export const catalogRouter = createCatalogRouter(catalog);
