import { Hono } from "hono";
import { patientProfessionalScope } from "../../application/patient-scope";
import { patients } from "../composition/patients";
import { clinic, run, type ApiEnv } from "./shared";

const app = new Hono<ApiEnv>();
app.get("/api/v1/patients", run(async (c) => {
  const u = c.get("auth").user;
  const own = patientProfessionalScope(u);
  return c.json({ items: (await patients.list(clinic()!, c.req.query("q"), own)).rows });
}));
app.post("/api/v1/patients", run(async (c) => c.json(await patients.create(clinic()!, await c.req.json()), 201)));
app.get("/api/v1/patients/duplicates", run(async (c) => c.json({
  items: (await patients.duplicates(clinic()!, c.req.query("document"), c.req.query("birthDate"), c.req.query("q") ?? ""))
    .rows,
})));
app.get("/api/v1/patients/:id", run(async (c) => {
  const u = c.get("auth").user;
  const own = patientProfessionalScope(u);
  return c.json(await patients.get(clinic()!, c.req.param("id"), own));
}));
app.patch("/api/v1/patients/:id", run(async (c) =>
  c.json(await patients.update(clinic()!, c.req.param("id"), await c.req.json()))));
app.get("/api/v1/guardians", run(async (c) => c.json({ items: (await patients.listGuardians(clinic()!)).rows })));
app.post("/api/v1/guardians", run(async (c) => c.json(await patients.createGuardian(clinic()!, await c.req.json()), 201)));
app.get("/api/v1/patient-guardians", run(async (c) =>
  c.json({ items: (await patients.listPatientGuardians(clinic()!, c.req.query("patientId"))).rows })));
app.post("/api/v1/patient-guardians", run(async (c) =>
  c.json(await patients.createPatientGuardian(clinic()!, await c.req.json()), 201)));
app.patch("/api/v1/patient-guardians/:id", run(async (c) =>
  c.json(await patients.updatePatientGuardian(clinic()!, c.req.param("id"), await c.req.json()))));
app.delete("/api/v1/patient-guardians/:id", run(async (c) =>
  c.json(await patients.deletePatientGuardian(clinic()!, c.req.param("id"), c.get("auth").userId))));
export const patientsRouter = app;
