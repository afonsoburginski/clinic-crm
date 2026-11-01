import { PERMISSIONS, type Permission } from "./permissions"
import type { Role } from "./types"

/** Permissão de cada papel na matriz: papel → conjunto de permissões. */
export type RoleMatrix = Record<string, ReadonlySet<string>>

export interface CellLock {
  /** `true` fixa a célula marcada; `false`, desmarcada. */
  checked: boolean
  reason: string
}

export const ADMIN_FULL_ACCESS = "O administrador tem acesso total."

/** A API recusa (422) qualquer alteração no administrador: a coluna dele é sempre marcada e travada. */
export function cellLock(role: Role, _permission: string): CellLock | null {
  if (role !== "admin") return null
  return { checked: true, reason: ADMIN_FULL_ACCESS }
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
