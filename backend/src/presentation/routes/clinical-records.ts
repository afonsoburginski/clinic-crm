import { Hono } from "hono";

import { getResource, listResource } from "../../application/resources";

import { clinic, run, assertProfessionalPatientAccess, registerResource, registerActions, type ApiEnv } from "./shared";
const app = new Hono<ApiEnv>();
app.get(
  "/api/v1/clinical/patients",
  run(async (c) =>
    c.json({
      items: await listResource(clinic()!, "clinical-record", { professionalId: c.get("auth").user.professionalId }),
    }),
  ),
);
app.get(
  "/api/v1/clinical-records/:id/versions",
  run(async (c) => {
    const user = c.get("auth").user;
    const item = await getResource(clinic()!, "clinical-record", c.req.param("id"));
    await assertProfessionalPatientAccess(item.patientId, user);
    const all = await listResource(clinic()!, "clinical-record", { professionalId: user.professionalId });
    const root = (x: any): any => (x.parentId ? root(all.find((z: any) => z.id === x.parentId) ?? x) : x);
    const original = root(item);
    const versions: any[] = [];
    const append = (x: any) => {
      versions.push(x);
      for (const child of all
        .filter((z: any) => z.parentId === x.id)
        .sort((a: any, b: any) => (a.version ?? 0) - (b.version ?? 0)))
        append(child);
    };
    append(original);
    return c.json({ items: versions });
  }),
);
registerResource(app, "clinical-records", "clinical-record");
registerActions(app, [
  ["clinical-records/:id/finalize", "clinical-record", "finalize"],
  ["clinical-records/:id/rectifications", "clinical-record", "rectifications"],
]);
export const clinical_recordsRouter = app;
