import { PERMISSIONS, type Permission } from "./permissions"
import type { Role } from "./types"

/** Permissão de cada papel na matriz: papel → conjunto de permissões. */
export type RoleMatrix = Record<string, ReadonlySet<string>>

export interface CellLock {
  /** `true` fixa a célula marcada; `false`, desmarcada. */
  checked: boolean
  reason: string
}

const ADMIN_REQUIRED: readonly string[] = ["users:read", "users:manage", "settings:manage"]

/**
 * Regras que a API também impõe (422): o administrador nunca recebe permissões clínicas (RN-AUTH-002) e
 * não perde o acesso a usuários e configurações — a clínica não pode se trancar fora destas telas.
 */
export function cellLock(role: Role, permission: string): CellLock | null {
  if (role !== "admin") return null
  if (permission.startsWith("clinical:")) {
    return { checked: false, reason: "O administrador não tem acesso clínico (gestão administrativa não implica acesso a prontuários)." }
  }
  if (ADMIN_REQUIRED.includes(permission)) {
    return { checked: true, reason: "O administrador precisa manter o acesso a usuários e configurações." }
  }
  return null
}

export function matrixOf(roles: { key: string; permissions: string[] }[]): RoleMatrix {
  return Object.fromEntries(roles.map((role) => [role.key, new Set(role.permissions)]))
}

export function isGranted(matrix: RoleMatrix, role: Role, permission: string) {
  return matrix[role]?.has(permission) ?? false
}

/** Marca ou desmarca uma célula; células travadas não mudam. */
export function toggleCell(matrix: RoleMatrix, role: Role, permission: string, granted: boolean): RoleMatrix {
  if (cellLock(role, permission)) return matrix
  const next = new Set(matrix[role] ?? [])
  if (granted) next.add(permission)
  else next.delete(permission)
  return { ...matrix, [role]: next }
}

/** Papéis cuja matriz difere da salva (a API recebe só estes). */
export function changedRoles(saved: RoleMatrix, draft: RoleMatrix): Role[] {
  return (Object.keys(draft) as Role[]).filter((role) => {
    const before = saved[role] ?? new Set<string>()
    const after = draft[role]
    return before.size !== after.size || [...after].some((permission) => !before.has(permission))
  })
}

/** Lista na ordem do catálogo, para um corpo de requisição estável. */
export function permissionList(granted: ReadonlySet<string>, catalog: readonly string[] = PERMISSIONS): string[] {
  return catalog.filter((permission) => granted.has(permission))
}

export type { Permission }
