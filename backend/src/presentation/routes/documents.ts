import { Hono } from "hono";

import { getResource, saveResource } from "../../application/resources";

import { clinic, run, registerResource, registerActions, type ApiEnv } from "./shared";
const app = new Hono<ApiEnv>();
app.post(
  "/api/v1/documents/:id/releases/:releaseId/revoke",
  run(async (c) => {
    const auth = c.get("auth");
    if (!auth?.userId) throw new Error("unauthorized");
    const old = await getResource(clinic()!, "document", c.req.param("id"));
    const reason = (await c.req.json()).reason;
    if (String(reason ?? "").trim().length < 5) throw new Error("validation");
    const releases = (old.releases ?? []).map((r: any) =>
      r.id === c.req.param("releaseId") && r.active
        ? { ...r, active: false, revokedAt: new Date().toISOString(), revokedBy: auth.userId, reason }
        : r,
    );
    if (releases.every((r: any) => r.active)) throw new Error("not_found");
    return c.json(await saveResource(clinic()!, "document", { ...old, releases }, old.id, auth.userId));
  }),
);
registerResource(app, "documents", "document");
registerActions(app, [
  ["documents/:id/status", "document", "status"],
  ["documents/:id/releases", "document", "releases"],
]);
export const documentsRouter = app;
