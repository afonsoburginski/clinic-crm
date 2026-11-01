import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type { Auth, User } from "@/application/auth"
import { createUserUseCases } from "@/application/use-cases/users"
import { defaultMatrix, effectivePermissions } from "@/domain/permissions"
import { createAuthRouter } from "@/presentation/routes/auth"
import { createUsersRouter } from "@/presentation/routes/users"
import type { ApiEnv } from "@/presentation/routes/shared"
import { FakeUserRepository } from "./fakes/users-repository"

const previousClinicId = Bun.env.CLINIC_ID
beforeAll(() => { Bun.env.CLINIC_ID = "clinic" })
afterAll(() => {
  if (previousClinicId === undefined) delete Bun.env.CLINIC_ID
  else Bun.env.CLINIC_ID = previousClinicId
})

const sessionUser = (roles: string[], extra: string[] = []): User => ({
  id: "actor-1", name: "Quem Chama", email: "q@c.com", roles,
  permissions: [...effectivePermissions(roles, defaultMatrix()), ...extra],
})

const tokens: Record<string, User> = {
  admin: sessionUser(["admin"]),
  reception: sessionUser(["reception"]),
  finance: sessionUser(["finance"]),
  reader: { ...sessionUser(["manager"]), permissions: ["users:read"] },
  // The administrator passes the guard even when the session carries no permission at all.
  bare: { ...sessionUser(["admin"]), permissions: [] },
}

const fakeAuth = {
  session: async (token: string) => {
    const user = tokens[token]
    if (!user) throw new Error("unauthorized")
    return user
  },
  login: async () => { throw new Error("invalid_credentials") },
  logout: async () => undefined,
} as unknown as Auth

let repository: FakeUserRepository
let send: (token: string | null, method: string, path: string, body?: unknown) => Response | Promise<Response>

beforeEach(() => {
  repository = new FakeUserRepository()
  const app = new Hono<ApiEnv>()
  app.route("/", createAuthRouter(fakeAuth))
  app.route("/", createUsersRouter(createUserUseCases(repository, { hash: async (p) => `hashed:${p}` })))
  send = (token, method, path, body) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
})

const newUser = { name: "Ana Souza", email: "ana@clinica.com", password: "senha-forte", roles: ["reception"] }
const error = (code: string, message: string) => ({ error: { code, message } })

describe("access to users, roles and permissions", () => {
  const routes: Array<[string, string]> = [
    ["GET", "/api/v1/users"], ["GET", "/api/v1/users/x"], ["GET", "/api/v1/roles"], ["GET", "/api/v1/permissions"],
    ["POST", "/api/v1/users"], ["PATCH", "/api/v1/users/x"], ["DELETE", "/api/v1/users/x"],
    ["PUT", "/api/v1/users/x/roles"], ["POST", "/api/v1/users/x/password"], ["PUT", "/api/v1/roles/reception/permissions"],
  ]

  test("anonymous callers get 401", async () => {
    for (const [method, path] of routes) {
      const response = await send(null, method, path, {})
      expect([method, path, response.status]).toEqual([method, path, 401])
    }
  })

  test("roles without users:read or users:manage get 403", async () => {
    for (const token of ["reception", "finance"]) {
      for (const [method, path] of routes) {
        const response = await send(token, method, path, {})
        expect([token, method, path, response.status]).toEqual([token, method, path, 403])
      }
    }
  })

  test("users:read alone reads but cannot write", async () => {
    expect((await send("reader", "GET", "/api/v1/users")).status).toBe(200)
    expect((await send("reader", "GET", "/api/v1/roles")).status).toBe(200)
    expect((await send("reader", "POST", "/api/v1/users", newUser)).status).toBe(403)
    expect((await send("reader", "PUT", "/api/v1/roles/reception/permissions", { permissions: [] })).status).toBe(403)
  })

  test("the administrator reaches clinical routes", async () => {
    for (const token of ["admin", "bare"]) {
      expect([token, (await send(token, "GET", "/api/v1/clinical-records")).status]).not.toEqual([token, 403])
    }
  })
})

describe("users API", () => {
  test("creates, reads, lists and never exposes the password hash", async () => {
    const created = await send("admin", "POST", "/api/v1/users", newUser)
    expect(created.status).toBe(201)
    const body = (await created.json()) as { id: string }
    expect(body).toMatchObject({ name: "Ana Souza", email: "ana@clinica.com", roles: ["reception"], active: true })
    expect(JSON.stringify(body)).not.toContain("hash")
    expect(await (await send("admin", "GET", `/api/v1/users/${body.id}`)).json()).toEqual(body)
    expect(await (await send("admin", "GET", "/api/v1/users")).json()).toEqual({ items: [body] })
  })

  test("answers validation and duplicate errors with the pt-BR message", async () => {
    const short = await send("admin", "POST", "/api/v1/users", { ...newUser, password: "curta" })
    expect(short.status).toBe(422)
    expect(await short.json()).toEqual(error("validation_error", "A senha precisa ter ao menos 8 caracteres."))
    await send("admin", "POST", "/api/v1/users", newUser)
    const duplicate = await send("admin", "POST", "/api/v1/users", newUser)
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toEqual(error("conflict", "Já existe um usuário com este e-mail."))
  })

  test("404 for an unknown user", async () => {
    expect((await send("admin", "GET", "/api/v1/users/ghost")).status).toBe(404)
    expect((await send("admin", "PATCH", "/api/v1/users/ghost", { name: "Zé Silva" })).status).toBe(404)
  })

  test("updates, replaces roles, resets the password and deactivates", async () => {
    const { id } = (await (await send("admin", "POST", "/api/v1/users", newUser)).json()) as { id: string }
    const patched = await send("admin", "PATCH", `/api/v1/users/${id}`, { name: "Ana Maria" })
    expect(patched.status).toBe(200)
    expect(await patched.json()).toMatchObject({ name: "Ana Maria" })
    const roles = await send("admin", "PUT", `/api/v1/users/${id}/roles`, { roles: ["finance"] })
    expect(await roles.json()).toMatchObject({ roles: ["finance"] })
    expect((await send("admin", "POST", `/api/v1/users/${id}/password`, { password: "nova-senha-1" })).status).toBe(200)
    expect(repository.hashes.get(id)).toBe("hashed:nova-senha-1")
    const removed = await send("admin", "DELETE", `/api/v1/users/${id}`)
    expect(removed.status).toBe(200)
    expect(await removed.json()).toMatchObject({ active: false })
    expect(repository.users).toHaveLength(1)
  })

  test("the last administrator is protected with a 409", async () => {
    const { id } = (await (await send("admin", "POST", "/api/v1/users", { ...newUser, roles: ["admin"] })).json()) as { id: string }
    const response = await send("admin", "DELETE", `/api/v1/users/${id}`)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(error("conflict", "A clínica precisa de ao menos um administrador ativo."))
  })
})

describe("roles and permissions API", () => {
  test("lists roles with permissions and the grouped catalog", async () => {
    const roles = (await (await send("admin", "GET", "/api/v1/roles")).json()) as { items: Array<{ key: string }> }
    expect(roles.items.map((role) => role.key)).toEqual(["admin", "reception", "professional", "finance", "manager"])
    const catalog = (await (await send("admin", "GET", "/api/v1/permissions")).json()) as { items: Array<{ group: string }> }
    expect(catalog.items.map((group) => group.group)).toContain("Financeiro")
  })

  test("saves a role's permissions and refuses unknown ones and any change to the administrator", async () => {
    const saved = await send("admin", "PUT", "/api/v1/roles/reception/permissions", { permissions: ["dashboard:read"] })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ key: "reception", permissions: ["dashboard:read"] })
    expect((await send("admin", "PUT", "/api/v1/roles/reception/permissions", { permissions: ["x:y"] })).status).toBe(422)
    const adminPartial = ["users:read", "users:manage", "settings:manage", "clinical:read"]
    expect((await send("admin", "PUT", "/api/v1/roles/admin/permissions", { permissions: adminPartial })).status).toBe(422)
    expect((await send("admin", "PUT", "/api/v1/roles/ghost/permissions", { permissions: [] })).status).toBe(404)
  })
})
