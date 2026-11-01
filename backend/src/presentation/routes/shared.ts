import { DomainError } from "@/application/errors";
import { hasAdminRole } from "@/domain/permissions";
import { query } from "@/infrastructure/database";

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
  if (hasAdminRole(user.roles) || !user.roles.includes("professional")) return;
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
  if (code === "internal_error") console.error("[unhandled]", e);
  const message =
    code === "invalid_credentials"
      ? "E-mail ou senha incorretos."
      : code === "login_locked"
        ? "Acesso bloqueado por 5 minutos após tentativas inválidas."
        : code === "auth_unconfigured"
          ? "AUTH_USERS_JSON e AUTH_SESSION_SECRET (mínimo 32 caracteres) são obrigatórios."
          : code === "internal_error"
            ? "Falha ao acessar os dados."
            : e instanceof DomainError
              ? e.detail
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
