import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  checkRolePermissions,
  defaultMatrix,
  effectivePermissions,
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

  test("the administrator holds every permission of the catalog, clinical ones included", () => {
    const admin = SYSTEM_ROLES.find((role) => role.key === "admin")!
    expect([...admin.permissions]).toEqual(PERMISSION_CATALOG.map((p) => p.key))
  })

  test("migrations 006 and 008 seed exactly the permission catalog", () => {
    const sql = ["006_users_roles_permissions.sql", "008_finance_export.sql"]
      .map((file) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"))
      .join("\n")
    const seeded = [...sql.matchAll(/^\s*\('([a-z-]+:[a-z-]+)', '([^']+)', '([^']+)'\)/gm)].map((m) => [m[1], m[2], m[3]])
    // 008 adds `finance:export` after the original 24, so the file order differs from the catalog order: compare by key.
    const byKey = (a: string[], b: string[]) => a[0].localeCompare(b[0])
    expect([...seeded].sort(byKey)).toEqual(PERMISSION_CATALOG.map((p) => [p.key, p.label, p.group]).sort(byKey))
  })
})

describe("effectivePermissions", () => {
  test("is the union of the roles' permissions (RN-AUTH-001)", () => {
    const result = effective("professional", "manager")
    expect(result.has("professionals:manage")).toBe(true)
    expect(result.has("appointments:read-own")).toBe(true)
    expect(result.has("clinical:read")).toBe(true)
  })

  test("grants the whole catalog to anyone holding the administrator role, whatever the matrix says", () => {
    const all = PERMISSION_CATALOG.map((p) => p.key)
    expect([...effective("admin", "professional")].sort()).toEqual([...all].sort())
    expect([...new Set(effectivePermissions(["admin"], new Map()))].sort()).toEqual([...all].sort())
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
  test("the administrator is immutable: it keeps the whole catalog and refuses any smaller set", () => {
    const all = PERMISSION_CATALOG.map((p) => p.key)
    expect(checkRolePermissions("admin", all)).toEqual({ ok: true, permissions: all })
    expect(checkRolePermissions("admin", ["dashboard:read"])).toMatchObject({ ok: false })
    expect(checkRolePermissions("admin", all.filter((key) => key !== "clinical:write"))).toMatchObject({ ok: false })
    expect(checkRolePermissions("finance", ["clinical:read"])).toMatchObject({ ok: true })
  })
})
