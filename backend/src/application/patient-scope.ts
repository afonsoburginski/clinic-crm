import { hasPermission, type User } from "@/application/auth";

/** A ausência de vínculo nunca deve significar acesso irrestrito. */
export function patientProfessionalScope(user: User): string | undefined {
  if (hasPermission(user, "patients:read")) return undefined;
  if (!hasPermission(user, "patients:read-own") || !user.professionalId) throw new Error("forbidden");
  return user.professionalId;
}
