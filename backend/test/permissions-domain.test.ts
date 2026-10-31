import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  ADMIN_LOCKED_PERMISSIONS,
  checkRolePermissions,
  defaultMatrix,
  effectivePermissions,
  isClinicalPermission,
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
} from "@/domain/permissions"

const matrix = defaultMatrix()
const effective = (...roles: string[]) => new Set(effectivePermissions(roles, matrix))

describe("default roles", () => {
  test("every default permission is in the catalog and the catalog has no duplicates", () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const role of SYSTEM_ROLES) for (const key of role.permissions) expect(keys).toContain(key)
  })

  test("the administrator manages users and settings but has no clinical permission (RN-AUTH-002)", () => {
    const admin = SYSTEM_ROLES.find((role) => role.key === "admin")!
    for (const key of ADMIN_LOCKED_PERMISSIONS) expect(admin.permissions).toContain(key)
    expect(admin.permissions.some(isClinicalPermission)).toBe(false)
  })

  test("migration 006 seeds exactly the permission catalog", () => {
    const sql = readFileSync(new URL("../migrations/006_users_roles_permissions.sql", import.meta.url), "utf8")
    const seeded = [...sql.matchAll(/^\s*\('([a-z-]+:[a-z-]+)', '([^']+)', '([^']+)'\)/gm)].map((m) => [m[1], m[2], m[3]])
    expect(seeded).toEqual(PERMISSION_CATALOG.map((p) => [p.key, p.label, p.group]))
  })
})

describe("effectivePermissions", () => {
  test("is the union of the roles' permissions (RN-AUTH-001)", () => {
    const result = effective("professional", "manager")
    expect(result.has("professionals:manage")).toBe(true)
    expect(result.has("appointments:read-own")).toBe(true)
    expect(result.has("clinical:read")).toBe(true)
  })

  test("strips clinical permissions from anyone holding the administrator role", () => {
    const result = effective("admin", "professional")
    expect(result.has("users:manage")).toBe(true)
    expect(result.has("clinical:read")).toBe(false)
    expect(result.has("clinical:write")).toBe(false)
  })

  test("a role missing from the matrix and unknown keys grant nothing", () => {
    expect(effectivePermissions(["ghost"], matrix)).toEqual([])
    expect(effectivePermissions(["x"], new Map([["x", ["patients:fly", "dashboard:read"]]]))).toEqual(["dashboard:read"])
  })
})

describe("checkRolePermissions", () => {
  test("accepts known keys once each", () => {
    expect(checkRolePermissions("finance", ["finance:read", "finance:read"])).toEqual({ ok: true, permissions: ["finance:read"] })
  })
  test("rejects unknown keys", () => {
    expect(checkRolePermissions("finance", ["finance:fly"])).toMatchObject({ ok: false })
  })
  test("keeps the administrator's locked permissions and clinical ban", () => {
    expect(checkRolePermissions("admin", [...ADMIN_LOCKED_PERMISSIONS, "dashboard:read"])).toMatchObject({ ok: true })
    expect(checkRolePermissions("admin", ["dashboard:read"])).toMatchObject({ ok: false })
    expect(checkRolePermissions("admin", [...ADMIN_LOCKED_PERMISSIONS, "clinical:write"])).toMatchObject({ ok: false })
    expect(checkRolePermissions("finance", ["clinical:read"])).toMatchObject({ ok: true })
  })
})
