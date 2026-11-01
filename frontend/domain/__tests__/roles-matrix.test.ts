import { describe, expect, it } from "vitest"

import { PERMISSIONS } from "../permissions"
import { cellLock, changedRoles, isGranted, matrixOf, permissionList, toggleCell } from "../roles-matrix"

const matrix = matrixOf([
  { key: "admin", permissions: ["users:read", "users:manage", "settings:manage", "dashboard:read"] },
  { key: "reception", permissions: ["dashboard:read", "patients:read"] },
])

describe("USR — matriz de papéis e permissões", () => {
  it("RN-USR-007 · a coluna do administrador é sempre marcada e travada, com a dica de acesso total", () => {
    for (const permission of PERMISSIONS) {
      expect(cellLock("admin", permission)).toEqual({ checked: true, reason: "O administrador tem acesso total." })
    }
    expect(cellLock("professional", "clinical:read")).toBeNull()
    expect(cellLock("reception", "users:manage")).toBeNull()
  })

  it("marca e desmarca células livres sem alterar a matriz original", () => {
    const next = toggleCell(matrix, "reception", "finance:read", true)
    expect(isGranted(next, "reception", "finance:read")).toBe(true)
    expect(isGranted(matrix, "reception", "finance:read")).toBe(false)
    expect(isGranted(toggleCell(next, "reception", "finance:read", false), "reception", "finance:read")).toBe(false)
  })

  it("ignora a alteração de células travadas", () => {
    expect(toggleCell(matrix, "admin", "users:manage", false)).toBe(matrix)
    expect(toggleCell(matrix, "admin", "clinical:read", true)).toBe(matrix)
  })

  it("lista só os papéis alterados, comparando o conjunto", () => {
    expect(changedRoles(matrix, matrix)).toEqual([])
    const next = toggleCell(toggleCell(matrix, "reception", "finance:read", true), "reception", "patients:read", false)
    expect(changedRoles(matrix, next)).toEqual(["reception"])
    const swapped = toggleCell(toggleCell(matrix, "reception", "patients:read", false), "reception", "finance:read", true)
    expect(changedRoles(matrix, swapped)).toEqual(["reception"])
  })

  it("serializa as permissões na ordem do catálogo, só as do catálogo", () => {
    const list = permissionList(new Set(["users:manage", "dashboard:read", "x:y"]))
    expect(list).toEqual(["dashboard:read", "users:manage"])
    expect(PERMISSIONS.indexOf("dashboard:read")).toBeLessThan(PERMISSIONS.indexOf("users:manage"))
  })
})
