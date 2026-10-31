import type { Appointment, AppointmentStatus, Patient, Professional, Role, User } from "./types"

export const PERMISSIONS = [
  "dashboard:read",
  "patients:read",
  "patients:read-own",
  "patients:write",
  "guardians:write",
  "appointments:read",
  "appointments:read-own",
  "appointments:write",
  "appointments:cancel",
  "appointments:status-own",
  "professionals:manage",
  "services:manage",
  "rooms:manage",
  "settings:manage",
  "audit:read",
  "finance:read",
  "team:invite",
  "clinical:read",
  "clinical:write",
  "assessments:interpret",
  "finance:write",
  "documents:read",
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  reception: "Recepção",
  professional: "Profissional",
  finance: "Financeiro",
  manager: "Gestor",
}

/**
 * Administrador não recebe `clinical:read` (RN006): gestão administrativa
 * não implica acesso ao conteúdo clínico.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "dashboard:read",
    "patients:read",
    "patients:write",
    "guardians:write",
    "appointments:read",
    "appointments:write",
    "appointments:cancel",
    "professionals:manage",
    "services:manage",
    "rooms:manage",
    "settings:manage",
    "audit:read",
    "finance:read",
    "team:invite",
    "documents:read",
  ],
  reception: [
    "dashboard:read",
    "patients:read",
    "patients:write",
    "guardians:write",
    "appointments:read",
    "appointments:write",
    "appointments:cancel",
    "documents:read",
  ],
  professional: [
    "dashboard:read",
    "patients:read-own",
    "appointments:read-own",
    "appointments:status-own",
    "clinical:read",
    "clinical:write",
    "assessments:interpret",
    "documents:read",
  ],
  finance: [
    "dashboard:read",
    "patients:read",
    "appointments:read",
    "finance:read",
    "finance:write",
    "documents:read",
  ],
  manager: ["dashboard:read", "appointments:read", "professionals:manage", "audit:read"],
}

export function permissionsFor(roles: Role[]): Set<Permission> {
  const set = new Set<Permission>()
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p)
  }
  return set
}

export function can(user: User | null | undefined, permission: Permission): boolean {
  if (!user) return false
  return permissionsFor(user.roles).has(permission)
}

export function canAny(user: User | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => can(user, p))
}

export function canReadAppointment(user: User | null | undefined, appt: Pick<Appointment, "professionalId">) {
  if (!user) return false
  if (can(user, "appointments:read")) return true
  return can(user, "appointments:read-own") && appt.professionalId === user.professionalId
}

export function isScopedToOwnAgenda(user: User | null | undefined) {
  return !!user && !can(user, "appointments:read") && can(user, "appointments:read-own")
}

/** RN-PRN-001: só atendimento confirmado, em curso ou concluído cria vínculo clínico com o paciente. */
export const CLINICAL_LINK_STATUSES: AppointmentStatus[] = ["confirmed", "in_progress", "completed"]

/**
 * Pacientes que o profissional pode acessar clinicamente: atendimento com status
 * de `CLINICAL_LINK_STATUSES` ou profissional de referência. Profissional inativo
 * (ou inexistente) não alcança ninguém.
 */
export function clinicalPatientIds(
  professional: Pick<Professional, "id" | "active"> | undefined,
  appointments: Pick<Appointment, "kind" | "status" | "patientId" | "professionalId">[],
  patients: Pick<Patient, "id" | "mainProfessionalId">[]
) {
  const ids = new Set<string>()
  if (!professional?.active) return ids
  for (const a of appointments) {
    if (a.kind === "appointment" && a.patientId && a.professionalId === professional.id && CLINICAL_LINK_STATUSES.includes(a.status)) {
      ids.add(a.patientId)
    }
  }
  for (const p of patients) if (p.mainProfessionalId === professional.id) ids.add(p.id)
  return ids
}
