/**
 * Permission catalog and default roles. This file is the single source of the defaults: the database
 * holds the editable matrix (`role_permissions`), seeded per clinic from `SYSTEM_ROLES` the first time
 * the clinic is used, and the guard reads the effective permissions from there.
 */

export interface PermissionDefinition {
  key: string
  label: string
  group: string
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { key: "dashboard:read", label: "Ver o painel", group: "Painel" },
  { key: "patients:read", label: "Ver todos os pacientes", group: "Pacientes" },
  { key: "patients:read-own", label: "Ver apenas os próprios pacientes", group: "Pacientes" },
  { key: "patients:write", label: "Cadastrar e editar pacientes", group: "Pacientes" },
  { key: "guardians:write", label: "Cadastrar e editar responsáveis", group: "Pacientes" },
  { key: "appointments:read", label: "Ver toda a agenda", group: "Agenda" },
  { key: "appointments:read-own", label: "Ver apenas a própria agenda", group: "Agenda" },
  { key: "appointments:write", label: "Criar e reagendar atendimentos", group: "Agenda" },
  { key: "appointments:cancel", label: "Cancelar atendimentos", group: "Agenda" },
  { key: "appointments:status-own", label: "Atualizar o status dos próprios atendimentos", group: "Agenda" },
  { key: "professionals:manage", label: "Gerir profissionais", group: "Cadastros" },
  { key: "services:manage", label: "Gerir serviços", group: "Cadastros" },
  { key: "rooms:manage", label: "Gerir salas", group: "Cadastros" },
  { key: "clinical:read", label: "Ler prontuários e dados clínicos", group: "Clínico" },
  { key: "clinical:write", label: "Registrar prontuários e dados clínicos", group: "Clínico" },
  { key: "assessments:interpret", label: "Interpretar avaliações", group: "Clínico" },
  { key: "finance:read", label: "Ver o financeiro", group: "Financeiro" },
  { key: "finance:write", label: "Lançar, baixar e estornar no financeiro", group: "Financeiro" },
  { key: "finance:export", label: "Exportar o financeiro (XLSX)", group: "Financeiro" },
  { key: "documents:read", label: "Ver documentos", group: "Documentos" },
  { key: "settings:manage", label: "Gerir as configurações da clínica", group: "Administração" },
  { key: "audit:read", label: "Ver a auditoria", group: "Administração" },
  { key: "team:invite", label: "Convidar a equipe", group: "Administração" },
  { key: "users:read", label: "Ver usuários e papéis", group: "Administração" },
  { key: "users:manage", label: "Gerir usuários e papéis", group: "Administração" },
]

const KNOWN = new Set(PERMISSION_CATALOG.map((permission) => permission.key))

export const isKnownPermission = (key: string) => KNOWN.has(key)

export interface SystemRole {
  key: string
  label: string
  description: string
  permissions: readonly string[]
}

export const ADMIN_ROLE = "admin"

/** The administrator can never lose these, or the clinic could lock itself out of the settings and user screens. */
export const ADMIN_LOCKED_PERMISSIONS: readonly string[] = ["users:read", "users:manage", "settings:manage"]

/**
 * RN-AUTH-002: administrative management does not imply clinical access. `clinical:*` is never granted to
 * the administrator role, and a user holding it is stripped of clinical permissions (the HTTP guard enforces the same).
 */
export const isClinicalPermission = (key: string) => key.startsWith("clinical:")

export const SYSTEM_ROLES: readonly SystemRole[] = [
  {
    key: ADMIN_ROLE,
    label: "Administrador",
    description: "Gestão administrativa da clínica; sem acesso clínico.",
    permissions: [
      "dashboard:read", "patients:read", "patients:write", "guardians:write", "appointments:read",
      "appointments:write", "appointments:cancel", "professionals:manage", "services:manage", "rooms:manage",
      "settings:manage", "audit:read", "finance:read", "finance:export", "team:invite", "documents:read", "users:read",
      "users:manage",
    ],
  },
  {
    key: "reception",
    label: "Recepção",
    description: "Pacientes, responsáveis e agenda.",
    permissions: [
      "dashboard:read", "patients:read", "patients:write", "guardians:write", "appointments:read",
      "appointments:write", "appointments:cancel", "documents:read",
    ],
  },
  {
    key: "professional",
    label: "Profissional",
    description: "Própria agenda, pacientes que atende e registros clínicos.",
    permissions: [
      "dashboard:read", "patients:read-own", "appointments:read-own", "appointments:status-own",
      "clinical:read", "clinical:write", "assessments:interpret", "documents:read",
    ],
  },
  {
    key: "finance",
    label: "Financeiro",
    description: "Lançamentos, pagamentos e relatórios financeiros.",
    permissions: [
      "dashboard:read", "patients:read", "appointments:read", "finance:read", "finance:write", "finance:export",
      "documents:read",
    ],
  },
  {
    key: "manager",
    label: "Gestor",
    description: "Visão da agenda, profissionais e auditoria.",
    permissions: ["dashboard:read", "appointments:read", "professionals:manage", "audit:read"],
  },
]

export const SYSTEM_ROLE_KEYS: readonly string[] = SYSTEM_ROLES.map((role) => role.key)

export function defaultPermissionsOf(roleKey: string): readonly string[] {
  return SYSTEM_ROLES.find((role) => role.key === roleKey)?.permissions ?? []
}

/**
 * Union of the permissions of the user's roles, restricted to the catalog. `matrix` is the persisted
 * role → permissions map; a role missing from it grants nothing.
 */
export function effectivePermissions(
  roles: readonly string[],
  matrix: ReadonlyMap<string, readonly string[]>,
): string[] {
  const granted = new Set<string>()
  for (const role of roles) for (const key of matrix.get(role) ?? []) if (isKnownPermission(key)) granted.add(key)
  if (roles.includes(ADMIN_ROLE)) for (const key of [...granted]) if (isClinicalPermission(key)) granted.delete(key)
  return [...granted]
}

export type RolePermissionsCheck = { ok: true; permissions: string[] } | { ok: false; reason: string }

/** Rules for saving a role's permission set: only known keys, and the administrator keeps its locked ones. */
export function checkRolePermissions(roleKey: string, requested: readonly string[]): RolePermissionsCheck {
  const permissions = [...new Set(requested)]
  const unknown = permissions.find((key) => !isKnownPermission(key))
  if (unknown) return { ok: false, reason: `Permissão desconhecida: ${unknown}.` }
  if (roleKey === ADMIN_ROLE) {
    if (permissions.some(isClinicalPermission)) {
      return { ok: false, reason: "O administrador não pode receber permissões clínicas." }
    }
    const missing = ADMIN_LOCKED_PERMISSIONS.find((key) => !permissions.includes(key))
    if (missing) return { ok: false, reason: "O administrador precisa manter o acesso a usuários e configurações." }
  }
  return { ok: true, permissions }
}

/** The role → permissions matrix a clinic starts with. */
export function defaultMatrix(): Map<string, string[]> {
  return new Map(SYSTEM_ROLES.map((role) => [role.key, [...role.permissions]]))
}
