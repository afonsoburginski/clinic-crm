import { describe, expect, it, vi } from "vitest"

import type { RoleView, UserAccount } from "@/domain/types"
import { itemFor, userWith, visibleIds } from "@/shared/ui/entity-menu/testing"

import { roleActions, userActions } from "../user-actions"

const account = (active: boolean): UserAccount => ({ id: "u-2", name: "Carla", email: "carla@x.com", active, roles: ["reception"], createdAt: "", updatedAt: "" })
const handlers = (isSelf = false) => ({ onEdit: vi.fn(), onEditRoles: vi.fn(), onResetPassword: vi.fn(), onSetActive: vi.fn(), isSelf })
const admin = userWith(["admin"])

describe("USR — ações do usuário", () => {
  it("administrador: editar, alterar papéis, redefinir senha, copiar e desativar (destrutivo)", () => {
    const actions = userActions(account(true), handlers())
    expect(visibleIds(actions, admin)).toEqual(["edit", "roles", "password", "copy-email", "copy-id", "deactivate"])
    expect(itemFor(actions, admin, "deactivate")).toMatchObject({ destructive: true, disabled: false })
  })

  it("usuário inativo oferece reativar (sem confirmação)", () => {
    const actions = userActions(account(false), handlers())
    expect(visibleIds(actions, admin)).toContain("reactivate")
    expect(visibleIds(actions, admin)).not.toContain("deactivate")
    expect(itemFor(actions, admin, "reactivate")?.destructive).toBe(false)
  })

  it("ninguém desativa o próprio acesso pelo menu", () => {
    expect(itemFor(userActions(account(true), handlers(true)), admin, "deactivate")).toMatchObject({ disabled: true, disabledReason: "Você não pode desativar o próprio acesso." })
  })

  it("sem users:manage as ações de escrita somem; resta copiar", () => {
    expect(visibleIds(userActions(account(true), handlers()), userWith(["reception"]))).toEqual(["copy-email", "copy-id"])
  })

  it("papéis: todos veem as permissões; só quem gere usuários edita", () => {
    const role: Pick<RoleView, "key" | "label"> = { key: "finance", label: "Financeiro" }
    const actions = roleActions(role, { onViewPermissions: vi.fn(), onEditPermissions: vi.fn() })
    expect(visibleIds(actions, admin)).toEqual(["view", "edit", "copy-key"])
    expect(visibleIds(actions, userWith(["manager"]))).toEqual(["view", "copy-key"])
  })
})
