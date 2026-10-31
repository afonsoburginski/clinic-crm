import { Hono } from "hono";

import { query } from "../../infrastructure/database";

import { actionResource, getResource, listResource, saveResource } from "../../application/resources";
import { hasPermission, session } from "../../application/auth";
export type ApiEnv = {
  Variables: {
    auth: {
      userId: string;
      user: any;
    };
  };
};
export const clinic = () => Bun.env.CLINIC_ID;
export async function assertProfessionalPatientAccess(patientId: string | undefined, user: any) {
  if (!user.roles.includes("professional")) return;
  if (!user.professionalId || !patientId) throw new Error("forbidden");
  const r = await query(
    "SELECT 1 FROM professionals pr JOIN patients p ON p.clinic_id=pr.clinic_id WHERE" +
      " pr.clinic_id=$1 AND pr.id=$2 AND pr.active=true AND p.id=$3 AND (p.main_profess" +
      "ional_id=pr.id OR EXISTS(SELECT 1 FROM appointments a WHERE a.clinic_id=p.clinic" +
      "_id AND a.patient_id=p.id AND a.professional_id=pr.id AND a.kind='appointment' A" +
      "ND a.status IN ('confirmed','in_progress','completed')))",
    [clinic(), user.professionalId, patientId],
  );
  if (!r.rowCount) throw new Error("forbidden");
}
export function failure(c: any, e: unknown) {
  const m = e instanceof Error ? e.message : "";
  const map: any = {
    database_unconfigured: [503, "database_unconfigured"],
    auth_unconfigured: [503, "auth_unconfigured"],
    invalid_credentials: [401, "invalid_credentials"],
    login_locked: [429, "login_locked"],
    not_found: [404, "not_found"],
    conflict: [409, "conflict"],
    validation: [422, "validation_error"],
    forbidden: [403, "forbidden"],
    unauthorized: [401, "unauthorized"],
    professional_busy: [409, "professional_busy"],
    room_busy: [409, "room_busy"],
  };
  const [s, code] = map[m] ?? [500, "internal_error"];
  const message =
    code === "invalid_credentials"
      ? "E-mail ou senha incorretos."
      : code === "login_locked"
        ? "Acesso bloqueado por 5 minutos após tentativas inválidas."
        : code === "auth_unconfigured"
          ? "AUTH_USERS_JSON e AUTH_SESSION_SECRET (mínimo 32 caracteres) são obrigatórios."
          : code === "internal_error"
            ? "Falha ao acessar os dados."
            : m;
  return c.json({ error: { code, message } }, s);
}
export const run = (fn: (c: any) => Promise<any>) => async (c: any) => {
  try {
    return await fn(c);
  } catch (e) {
    return failure(c, e);
  }
};
export function registerResource(app: Hono<ApiEnv>, path: string, type: string) {
  const base = `/api/v1/${path}`;
  app.get(
    base,
    run(async (c) => {
      let items = await listResource(clinic()!, type, {
        patientId: c.req.query("patientId"),
        status: c.req.query("status"),
        from: c.req.query("from"),
        to: c.req.query("to"),
        professionalId:
          ["clinical-record", "assessment", "aba-plan", "aba-session", "document"].includes(type) &&
          c.get("auth").user.roles.includes("professional")
            ? c.get("auth").user.professionalId
            : undefined,
      });
      if (type === "document")
        items = items.filter((x: any) =>
          x.classification === "clinical"
            ? hasPermission(c.get("auth").user, "clinical:read")
            : x.classification === "financial"
              ? hasPermission(c.get("auth").user, "finance:read")
              : x.classification === "administrative"
                ? hasPermission(c.get("auth").user, "patients:read")
                : false,
        );
      return c.json({ items });
    }),
  );
  app.post(
    base,
    run(async (c) => {
      const body = await c.req.json();
      const user = c.get("auth").user;
      if (
        ["clinical-record", "assessment", "aba-plan", "aba-session"].includes(type) ||
        (type === "document" && body.classification === "clinical")
      )
        await assertProfessionalPatientAccess(body.patientId, user);
      return c.json(await saveResource(clinic()!, type, body, undefined, c.get("auth").userId), 201);
    }),
  );
  const one = `${base}/:id`;
  app.get(
    one,
    run(async (c) => {
      const item = await getResource(clinic()!, type, c.req.param("id"));
      const user = c.get("auth").user;
      if (
        ["clinical-record", "assessment", "aba-plan", "aba-session"].includes(type) ||
        (type === "document" && item.classification === "clinical")
      )
        await assertProfessionalPatientAccess(item.patientId, user);
      return c.json(item);
    }),
  );
  app.patch(
    one,
    run(async (c) => {
      const body = await c.req.json();
      const user = c.get("auth").user;
      if (["clinical-record", "assessment", "aba-plan", "aba-session"].includes(type))
        await assertProfessionalPatientAccess((await getResource(clinic()!, type, c.req.param("id"))).patientId, user);
      return c.json(await saveResource(clinic()!, type, body, c.req.param("id"), c.get("auth").userId));
    }),
  );
}
export function registerActions(app: Hono<ApiEnv>, actions: string[][]) {
  for (const [path, type, action] of actions)
    app.post(
      `/api/v1/${path}`,
      run(async (c) => {
        const body = await c.req.json();
        const [family, ...tail] = path.split("/");
        const id = c.req.param("id");
        const rt = family === "financial" && tail[0] === "payments" ? "financial-payment" : type;
        const auth = c.get("auth");
        if (!auth?.userId) throw new Error("unauthorized");
        if (["clinical-record", "assessment", "aba-plan", "aba-session"].includes(type))
          await assertProfessionalPatientAccess((await getResource(clinic()!, type, id)).patientId, auth.user);
        if (type === "document") {
          const doc = await getResource(clinic()!, type, id);
          if (doc.classification === "clinical") await assertProfessionalPatientAccess(doc.patientId, auth.user);
        }
        return c.json(await actionResource(clinic()!, rt, id, action, body, auth.userId));
      }),
    );
}
