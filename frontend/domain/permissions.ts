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
  "users:read",
  "users:manage",
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_GROUPS = ["Painel", "Pacientes", "Agenda", "Cadastros", "Clínico", "Financeiro", "Documentos", "Administração"] as const

/** Rótulo e grupo de cada permissão na matriz de papéis (espelha o catálogo da API, que é a fonte). */
export const PERMISSION_LABELS: Record<Permission, { label: string; group: (typeof PERMISSION_GROUPS)[number] }> = {
  "dashboard:read": { label: "Ver o painel", group: "Painel" },
  "patients:read": { label: "Ver todos os pacientes", group: "Pacientes" },
  "patients:read-own": { label: "Ver apenas os próprios pacientes", group: "Pacientes" },
  "patients:write": { label: "Cadastrar e editar pacientes", group: "Pacientes" },
  "guardians:write": { label: "Cadastrar e editar responsáveis", group: "Pacientes" },
  "appointments:read": { label: "Ver toda a agenda", group: "Agenda" },
  "appointments:read-own": { label: "Ver apenas a própria agenda", group: "Agenda" },
  "appointments:write": { label: "Criar e reagendar atendimentos", group: "Agenda" },
  "appointments:cancel": { label: "Cancelar atendimentos", group: "Agenda" },
  "appointments:status-own": { label: "Atualizar o status dos próprios atendimentos", group: "Agenda" },
  "professionals:manage": { label: "Gerir profissionais", group: "Cadastros" },
  "services:manage": { label: "Gerir serviços", group: "Cadastros" },
  "rooms:manage": { label: "Gerir salas", group: "Cadastros" },
  "clinical:read": { label: "Ler prontuários e dados clínicos", group: "Clínico" },
  "clinical:write": { label: "Registrar prontuários e dados clínicos", group: "Clínico" },
  "assessments:interpret": { label: "Interpretar avaliações", group: "Clínico" },
  "finance:read": { label: "Ver o financeiro", group: "Financeiro" },
  "finance:write": { label: "Lançar, baixar e estornar no financeiro", group: "Financeiro" },
  "documents:read": { label: "Ver documentos", group: "Documentos" },
  "settings:manage": { label: "Gerir as configurações da clínica", group: "Administração" },
  "audit:read": { label: "Ver a auditoria", group: "Administração" },
  "team:invite": { label: "Convidar a equipe", group: "Administração" },
  "users:read": { label: "Ver usuários e papéis", group: "Administração" },
  "users:manage": { label: "Gerir usuários e papéis", group: "Administração" },
}

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
    "users:read",
    "users:manage",
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

/**
 * Permissões padrão da união dos papéis. A API é quem decide (matriz editável no banco) e devolve as efetivas
 * em `user.permissions`; este cálculo só vale para sessões antigas, sem esse campo. Quem tem o papel
 * `admin` nunca fica com `clinical:*` (RN-AUTH-002), igual ao backend.
 */
export function permissionsFor(roles: Role[]): Set<Permission> {
  const set = new Set<Permission>()
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p)
  }
  if (roles.includes("admin")) for (const p of set) if (p.startsWith("clinical:")) set.delete(p)
  return set
}

/** Permissões efetivas do usuário: as da API quando presentes, senão o padrão dos papéis. */
export function effectivePermissions(user: User): ReadonlySet<string> {
  return user.permissions ? new Set(user.permissions) : permissionsFor(user.roles)
}

export function can(user: User | null | undefined, permission: Permission): boolean {
  if (!user) return false
  return effectivePermissions(user).has(permission)
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
