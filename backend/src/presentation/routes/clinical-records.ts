import { Hono } from "hono";

import type { ClinicalRecordUseCases } from "@/application/use-cases/clinical-records";
import { clinicalRecords } from "@/presentation/composition/clinical-records";
import { actorOf, handle, param } from "@/presentation/routes/context";
import { clinic, type ApiEnv } from "@/presentation/routes/shared";

export function createClinicalRecordsRouter({ queries, commands }: ClinicalRecordUseCases) {
  const app = new Hono<ApiEnv>();
  app.get(
    "/api/v1/clinical/patients",
    handle(async (c) =>
      c.json({ items: await queries.listClinicalPatients({ clinicId: clinic()!, actor: actorOf(c) }) }),
    ),
  );
  app.get(
    "/api/v1/clinical-records/:id/versions",
    handle(async (c) =>
      c.json({
        items: await queries.listVersions({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") }),
      }),
    ),
  );
  app.get(
    "/api/v1/clinical-records",
    handle(async (c) =>
      c.json({
        items: await queries.listRecords({
          clinicId: clinic()!,
          actor: actorOf(c),
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
    "/api/v1/clinical-records",
    handle(async (c) =>
      c.json(
        await commands.createRecord({ clinicId: clinic()!, actor: actorOf(c), body: await c.req.json() }),
        201,
      ),
    ),
  );
  app.get(
    "/api/v1/clinical-records/:id",
    handle(async (c) =>
      c.json(await queries.getRecord({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") })),
    ),
  );
  app.patch(
    "/api/v1/clinical-records/:id",
    handle(async (c) =>
      c.json(
        await commands.updateRecord({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/clinical-records/:id/finalize",
    handle(async (c) => {
      await c.req.json(); // finalize takes no input, but a malformed body has always been rejected
      return c.json(await commands.finalizeRecord({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") }));
    }),
  );
  app.post(
    "/api/v1/clinical-records/:id/rectifications",
    handle(async (c) =>
      c.json(
        await commands.rectifyRecord({
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

export const clinical_recordsRouter = createClinicalRecordsRouter(clinicalRecords);
