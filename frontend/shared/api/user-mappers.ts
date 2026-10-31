import { PERMISSIONS, ROLE_LABELS } from "@/domain/permissions"
import type { PermissionGroup, Role, RoleView, UserAccount } from "@/domain/types"

import { flag, count, listOf, optional, text, timestamp, type Row } from "./backend-mappers"

/** Usuários, papéis e permissões da API (`/users`, `/roles`, `/permissions`). A API nunca devolve senha nem hash. */

const isRole = (value: unknown): value is Role => typeof value === "string" && value in ROLE_LABELS
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [])

export function toUserAccount(raw: Row): UserAccount {
  const createdAt = timestamp(raw.createdAt)
  return {
    id: text(raw.id),
    name: text(raw.name),
    email: text(raw.email),
    active: flag(raw.active, true),
    roles: strings(raw.roles).filter(isRole),
    professionalId: optional(raw.professionalId),
    createdAt,
    updatedAt: timestamp(raw.updatedAt) || createdAt,
  }
}

/** Só permissões do catálogo que a UI conhece entram na matriz; as demais são ignoradas. */
const known = new Set<string>(PERMISSIONS)

export function toRoleView(raw: Row): RoleView {
  const key = text(raw.key)
  return {
    key: key as Role,
    label: text(raw.label) || (isRole(key) ? ROLE_LABELS[key] : key),
    description: text(raw.description),
    isSystem: flag(raw.isSystem),
    permissions: strings(raw.permissions).filter((p) => known.has(p)),
    userCount: count(raw.userCount),
  }
}

export function toPermissionGroups(rows: Row[]): PermissionGroup[] {
  return rows
    .map((row) => ({
      group: text(row.group),
      permissions: listOf(row.permissions)
        .map((p) => ({ key: text(p.key), label: text(p.label), group: text(p.group) || text(row.group) }))
        .filter((p) => known.has(p.key)),
    }))
    .filter((group) => group.permissions.length > 0)
}
