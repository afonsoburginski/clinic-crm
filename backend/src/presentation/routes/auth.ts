import { Hono } from "hono";
import { getHealth } from "@/domain/health";
import { databaseReady } from "@/infrastructure/database";

import { getResource } from "@/application/resources";
import { hasPermission, permissionFor, type Auth } from "@/application/auth";
import { auth } from "@/presentation/composition/auth";
import { clinic, run, failure, type ApiEnv } from "@/presentation/routes/shared";
export function createAuthRouter(auth: Auth) {
  const app = new Hono<ApiEnv>();
  app
    .get("/health", (c) => c.json(getHealth()))
    .get("/health/ready", async (c) => {
      const r = await databaseReady();
      return c.json({ status: r ? "ready" : "not_ready", database: r }, r ? 200 : 503);
    });
  app.use("/api/v1/*", async (c, next) => {
    if (!clinic())
      return c.json({ error: { code: "database_unconfigured", message: "CLINIC_ID não configurado." } }, 503);
    if (
      c.req.path === "/api/v1/auth/login" ||
      c.req.path === "/api/v1/auth/session" ||
      c.req.path === "/api/v1/auth/logout"
    ) {
      await next();
      return;
    }
    try {
      const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!token) throw new Error("unauthorized");
      const user = await auth.session(token);
      c.set("auth", { userId: user.id, user });
      const permission = permissionFor(c.req.path, c.req.method);
      if (permission === null) throw new Error("forbidden");
      let allowed = permission === "documents:write" ? false : hasPermission(user, permission);
      if (!allowed && permission === "appointments:read") allowed = hasPermission(user, "appointments:read-own");
      if (!allowed && permission === "patients:read") allowed = hasPermission(user, "patients:read-own");
      if (permission.startsWith("clinical:") && user.roles.includes("admin")) allowed = false;
      if (c.req.path.startsWith("/api/v1/documents")) {
        const parts = c.req.path.split("/");
        const id = c.req.param("id") || parts[4];
        const body =
          c.req.method === "GET"
            ? {}
            : await c.req.raw
                .clone()
                .json()
                .catch(() => ({}));
        const resource = id ? await getResource(clinic()!, "document", id).catch(() => null) : null;
        const classification = resource?.classification ?? body.classification;
        const required =
          classification === "clinical"
            ? c.req.method === "GET"
              ? "clinical:read"
              : "clinical:write"
            : classification === "financial"
              ? c.req.method === "GET"
                ? "finance:read"
                : "finance:write"
              : classification === "administrative"
                ? c.req.method === "GET"
                  ? "patients:read"
                  : "patients:write"
                : null;
        allowed =
          c.req.method === "GET" && !id
            ? hasPermission(user, "documents:read")
            : required
              ? hasPermission(user, required)
              : false;
      }
      if (!allowed) throw new Error("forbidden");
      await next();
    } catch (e) {
      return failure(c, e);
    }
  });
  app.post(
    "/api/v1/auth/login",
    run(async (c) => {
      const p = await c.req.json();
      if (typeof p.email !== "string" || typeof p.password !== "string") throw new Error("validation");
      return c.json(await auth.login(p.email, p.password));
    }),
  );
  app.get(
    "/api/v1/auth/session",
    run(async (c) => {
      const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!token) throw new Error("unauthorized");
      return c.json({ user: await auth.session(token) });
    }),
  );
  app.post(
    "/api/v1/auth/logout",
    run(async (c) => {
      const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!token) throw new Error("unauthorized");
      await auth.logout(token);
      return c.json({ ok: true });
    }),
  );
  return app;
}
export const authRouter = createAuthRouter(auth);
