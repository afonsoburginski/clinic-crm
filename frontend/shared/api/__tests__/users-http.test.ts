import { beforeEach, describe, expect, it } from "vitest"

import { ConflictError, ForbiddenError, ValidationError } from "@/domain/errors"

import { api } from "../api"
import { toPermissionGroups, toRoleView, toUserAccount } from "../user-mappers"
import { resetUserNames } from "../user-directory"
import { callsTo, calls, denied, installFakeApi, reply, routes, signInAs } from "./support/fake-api"

// Usuários, papéis e permissões contra a API Hono simulada.
installFakeApi()
beforeEach(() => resetUserNames())

const userRow = (over: Record<string, unknown> = {}) => ({
  id: "u2",
  name: "Ana Souza",
  email: "ana@clinica.com",
  active: true,
  roles: ["reception"],
  professionalId: null,
  createdAt: "2025-03-01T10:00:00.000Z",
  updatedAt: "2025-03-02T10:00:00.000Z",
  ...over,
})

describe("mappers de usuários, papéis e permissões", () => {
  it("toUserAccount ignora papel desconhecido e converte null em ausência", () => {
    expect(toUserAccount(userRow({ roles: ["admin", "ghost"], professionalId: null }))).toEqual({
      id: "u2", name: "Ana Souza", email: "ana@clinica.com", active: true, roles: ["admin"], professionalId: undefined,
      createdAt: "2025-03-01T10:00:00.000Z", updatedAt: "2025-03-02T10:00:00.000Z",
    })
    expect(toUserAccount(userRow({ professionalId: "p1" })).professionalId).toBe("p1")
  })

  it("toUserAccount não carrega senha nem hash, mesmo que a resposta traga", () => {
    const account = toUserAccount({ ...userRow(), passwordHash: "x", password: "y" })
    expect(JSON.stringify(account)).not.toMatch(/passwordHash|password/)
  })

  it("toRoleView mantém só permissões que a UI conhece e usa o rótulo da API", () => {
    expect(toRoleView({ key: "finance", label: "Financeiro", description: "d", isSystem: true, permissions: ["finance:read", "x:y"], userCount: 2 })).toEqual({
      key: "finance", label: "Financeiro", description: "d", isSystem: true, permissions: ["finance:read"], userCount: 2,
    })
  })

  it("toPermissionGroups descarta grupos sem permissão conhecida", () => {
    const groups = toPermissionGroups([
      { group: "Financeiro", permissions: [{ key: "finance:read", label: "Ver o financeiro", group: "Financeiro" }, { key: "nope:x", label: "?", group: "Financeiro" }] },
      { group: "Vazio", permissions: [{ key: "nope:y", label: "?", group: "Vazio" }] },
    ])
    expect(groups).toEqual([{ group: "Financeiro", permissions: [{ key: "finance:read", label: "Ver o financeiro", group: "Financeiro" }] }])
  })
})

describe("usuários", () => {
  it("list devolve as contas mapeadas", async () => {
    signInAs(["admin"])
    routes["GET /users"] = { items: [userRow(), userRow({ id: "u3", name: "Bia Lima", roles: ["finance"], active: false })] }
    const list = await api.users.list()
    expect(list.map((u) => [u.id, u.roles, u.active])).toEqual([["u2", ["reception"], true], ["u3", ["finance"], false]])
  })

  it("perfil sem users:read recebe acesso negado", async () => {
    signInAs(["reception"])
    routes["GET /users"] = denied
    await expect(api.users.list()).rejects.toThrow(ForbiddenError)
  })

  it("create valida antes de chamar a API e envia o vínculo vazio como null", async () => {
    signInAs(["admin"])
    const base = { name: "Ana Souza", email: "ana@clinica.com", roles: ["reception"], professionalId: "", active: true }
    await expect(api.users.create({ ...base, password: "curta" })).rejects.toThrow(ValidationError)
    expect(calls).toHaveLength(0)
    routes["POST /users"] = (call: { body: Record<string, unknown> }) => userRow({ ...call.body, id: "u9" })
    const created = await api.users.create({ ...base, password: "senha-forte" })
    expect(callsTo("POST /users")[0].body).toEqual({ ...base, professionalId: null, password: "senha-forte" })
    expect(created).toMatchObject({ id: "u9", roles: ["reception"] })
  })

  it("e-mail duplicado vira conflito com a mensagem da API", async () => {
    signInAs(["admin"])
    routes["POST /users"] = reply(409, { error: { code: "conflict", message: "Já existe um usuário com este e-mail." } })
    const failure = api.users.create({ name: "Ana Souza", email: "ana@clinica.com", roles: ["reception"], professionalId: "", active: true, password: "senha-forte" })
    await expect(failure).rejects.toThrow(ConflictError)
    await expect(failure).rejects.toThrow("Já existe um usuário com este e-mail.")
  })

  it("update envia nome, papéis e vínculo em um PATCH", async () => {
    signInAs(["admin"])
    routes["PATCH /users/u2"] = (call: { body: Record<string, unknown> }) => userRow(call.body)
    const updated = await api.users.update("u2", { name: "Ana Maria", email: "ana@clinica.com", roles: ["finance"], professionalId: "p1", active: true })
    expect(callsTo("PATCH /users/u2")[0].body).toEqual({ name: "Ana Maria", email: "ana@clinica.com", roles: ["finance"], professionalId: "p1", active: true })
    expect(updated).toMatchObject({ name: "Ana Maria", roles: ["finance"], professionalId: "p1" })
  })

  it("setActive(false) desativa; o último administrador é protegido pela API (409)", async () => {
    signInAs(["admin"])
    routes["PATCH /users/u2"] = (call: { body: Record<string, unknown> }) => userRow(call.body)
    expect((await api.users.setActive("u2", false)).active).toBe(false)
    expect(callsTo("PATCH /users/u2")[0].body).toEqual({ active: false })
    routes["PATCH /users/u1"] = reply(409, { error: { code: "conflict", message: "A clínica precisa de ao menos um administrador ativo." } })
    await expect(api.users.setActive("u1", false)).rejects.toThrow("A clínica precisa de ao menos um administrador ativo.")
  })

  it("resetPassword exige senhas iguais e envia só a nova senha", async () => {
    signInAs(["admin"])
    await expect(api.users.resetPassword("u2", { password: "nova-senha-1", confirm: "outra-senha-1" })).rejects.toThrow("As senhas não conferem")
    expect(calls).toHaveLength(0)
    routes["POST /users/u2/password"] = userRow()
    await api.users.resetPassword("u2", { password: "nova-senha-1", confirm: "nova-senha-1" })
    expect(callsTo("POST /users/u2/password")[0].body).toEqual({ password: "nova-senha-1" })
  })
})

describe("papéis e permissões", () => {
  it("lista papéis e catálogo e salva a matriz de um papel", async () => {
    signInAs(["admin"])
    routes["GET /roles"] = { items: [{ key: "reception", label: "Recepção", description: "", isSystem: true, permissions: ["dashboard:read"], userCount: 1 }] }
    routes["GET /permissions"] = { items: [{ group: "Painel", permissions: [{ key: "dashboard:read", label: "Ver o painel", group: "Painel" }] }] }
    expect((await api.roles.list())[0]).toMatchObject({ key: "reception", permissions: ["dashboard:read"], userCount: 1 })
    expect((await api.roles.catalog())[0].group).toBe("Painel")
    routes["PUT /roles/reception/permissions"] = (call: { body: { permissions: string[] } }) => ({ key: "reception", label: "Recepção", description: "", isSystem: true, permissions: call.body.permissions, userCount: 1 })
    const saved = await api.roles.setPermissions("reception", ["dashboard:read", "patients:read"])
    expect(callsTo("PUT /roles/reception/permissions")[0].body).toEqual({ permissions: ["dashboard:read", "patients:read"] })
    expect(saved.permissions).toEqual(["dashboard:read", "patients:read"])
  })

  it("a API recusa o que trancaria o administrador com a mensagem em pt-BR", async () => {
    signInAs(["admin"])
    routes["PUT /roles/admin/permissions"] = reply(422, { error: { code: "validation_error", message: "O administrador não pode receber permissões clínicas." } })
    await expect(api.roles.setPermissions("admin", ["clinical:read"])).rejects.toThrow("O administrador não pode receber permissões clínicas.")
  })
})

describe("nomes de autores (lacuna do item 1)", () => {
  const entry = {
    id: "e1", type: "income", description: "Sessão", category: "Consulta", competence: "2025-03", dueDate: "2099-03-10",
    amountCents: 10000, status: "open", createdBy: "u1", createdAt: "2025-03-01T10:00:00.000Z",
    payments: [{ id: "pay1", amountCents: 4000, paidAt: "2025-03-05", method: "pix", requestId: "rq1", reversedAt: null, createdBy: "u2" }],
  }

  it("quem tem users:read vê o nome de quem registrou o pagamento", async () => {
    signInAs(["admin", "finance"], { permissions: ["users:read", "finance:read"] })
    routes["GET /users"] = { items: [userRow({ id: "u2", name: "Bia Lima" })] }
    routes["GET /financial/entries/e1"] = entry
    const detail = await api.financial.get("e1")
    expect(detail.payments[0].registeredByName).toBe("Bia Lima")
  })

  it("sem users:read não há chamada à lista e o rótulo continua neutro", async () => {
    signInAs(["finance"])
    routes["GET /financial/entries/e1"] = entry
    const detail = await api.financial.get("e1")
    expect(detail.payments[0].registeredByName).toBe("Usuário da clínica")
    expect(callsTo("GET /users")).toHaveLength(0)
  })

  it("falha na lista de usuários não derruba a tela", async () => {
    signInAs(["admin", "finance"], { permissions: ["users:read", "finance:read"] })
    routes["GET /users"] = reply(500, { error: { code: "internal_error", message: "x" } })
    routes["GET /financial/entries/e1"] = entry
    expect((await api.financial.get("e1")).payments[0].registeredByName).toBe("Usuário da clínica")
  })

  it("o nome do próprio usuário da sessão vale sem a lista", async () => {
    signInAs(["finance"], { id: "u2", name: "Marina Alves" })
    routes["GET /financial/entries/e1"] = entry
    expect((await api.financial.get("e1")).payments[0].registeredByName).toBe("Marina Alves")
  })

  it("a auditoria mostra o nome de quem agiu quando a lista de usuários está acessível", async () => {
    signInAs(["admin"], { permissions: ["users:read", "audit:read"] })
    routes["GET /users"] = { items: [userRow({ id: "u2", name: "Bia Lima" })] }
    routes["GET /audit"] = { items: [{ actorId: "u2", at: "2025-03-01T10:00:00.000Z", action: "create", resource: "user", resourceId: "u9", summary: "Criou um usuário", changes: null }] }
    const [entry] = await api.audit.list()
    expect(entry).toMatchObject({ actorName: "Bia Lima", resource: "user", summary: "Criou um usuário" })
  })
})
