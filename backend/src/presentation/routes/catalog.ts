import { Hono } from "hono";

import { query } from "../../infrastructure/database";

import { getResource, listResource, saveResource } from "../../application/resources";
import { session } from "../../application/auth";
import { clinic, run, registerResource, type ApiEnv } from "./shared";
const app = new Hono<ApiEnv>();
app.put(
  "/api/v1/professionals/:id/schedule",
  run(async (c) =>
    c.json(
      await saveResource(clinic()!, "professional", { schedule: (await c.req.json()).schedule }, c.req.param("id")),
    ),
  ),
);
app.post(
  "/api/v1/professionals/:id/unavailabilities",
  run(async (c) => {
    const p = await c.req.json();
    return c.json(
      await saveResource(
        clinic()!,
        "professional",
        { unavailabilities: [...(p.unavailabilities ?? []), p] },
        c.req.param("id"),
      ),
    );
  }),
);
app.delete(
  "/api/v1/professionals/:id/unavailabilities/:unavailabilityId",
  run(async (c) => {
    const x = await getResource(clinic()!, "professional", c.req.param("id"));
    return c.json(
      await saveResource(
        clinic()!,
        "professional",
        { unavailabilities: (x.unavailabilities ?? []).filter((u: any) => u.id !== c.req.param("unavailabilityId")) },
        x.id,
      ),
    );
  }),
);
app.get(
  "/api/v1/settings",
  run(async (c) => {
    const x = await listResource(clinic()!, "settings");
    return c.json(x[0] ?? {});
  }),
);
app.put(
  "/api/v1/settings",
  run(async (c) => {
    const x = await listResource(clinic()!, "settings");
    return c.json(await saveResource(clinic()!, "settings", await c.req.json(), x[0]?.id));
  }),
);
app.get(
  "/api/v1/audit",
  run(async (c) => {
    const r = await query(
      'SELECT actor_id AS "actorId",occurred_at AS at,action,resource,resource_id AS "r' +
        "esourceId\",CASE WHEN resource IN ('clinical-record','assessment','aba-plan','aba" +
        "-session','document','document-release') THEN 'Alterou registro cl\u00EDnico' ELSE su" +
        "mmary END AS summary,CASE WHEN resource IN ('clinical-record','assessment','aba-" +
        "plan','aba-session','document','document-release','financial-entry') THEN NULL E" +
        "LSE changes END AS changes FROM audit_events WHERE clinic_id=$1 AND ($2::text IS" +
        " NULL OR resource=$2) AND ($3::text IS NULL OR actor_id=$3) ORDER BY occurred_at" +
        " DESC LIMIT 500",
      [clinic(), c.req.query("resource") ?? null, c.req.query("actorId") ?? null],
    );
    return c.json({ items: r.rows });
  }),
);
registerResource(app, "specialties", "specialty");
registerResource(app, "services", "service");
registerResource(app, "rooms", "room");
registerResource(app, "professionals", "professional");
export const catalogRouter = app;
