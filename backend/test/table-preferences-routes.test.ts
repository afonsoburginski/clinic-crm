import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { AUTHENTICATED, permissionFor, type Auth, type User } from "@/application/auth"
import { createTablePreferenceUseCases } from "@/application/use-cases/table-preferences"
import { createAuthRouter } from "@/presentation/routes/auth"
import { createTablePreferencesRouter } from "@/presentation/routes/table-preferences"
import type { ApiEnv } from "@/presentation/routes/shared"
import { FakeTablePreferenceRepository } from "./fakes/table-preferences-repository"

const previousClinicId = Bun.env.CLINIC_ID
beforeAll(() => { Bun.env.CLINIC_ID = "clinic" })
afterAll(() => {
  if (previousClinicId === undefined) delete Bun.env.CLINIC_ID
  else Bun.env.CLINIC_ID = previousClinicId
})

const user = (id: string, roles: string[], permissions: string[]): User => ({ id, name: id, email: `${id}@c.com`, roles, permissions })
const tokens: Record<string, User> = {
  ana: user("ana", ["reception"], ["patients:read"]),
  bruno: user("bruno", ["manager"], []),
}
const fakeAuth = {
  session: async (token: string) => {
    const found = tokens[token]
    if (!found) throw new Error("unauthorized")
    return found
  },
  login: async () => { throw new Error("invalid_credentials") },
  logout: async () => undefined,
} as unknown as Auth

let send: (token: string | null, method: string, path: string, body?: unknown) => Response | Promise<Response>
beforeEach(() => {
  const app = new Hono<ApiEnv>()
  app.route("/", createAuthRouter(fakeAuth))
  app.route("/", createTablePreferencesRouter(createTablePreferenceUseCases(new FakeTablePreferenceRepository())))
  send = (token, method, path, body) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    })
})

const base = "/api/v1/preferences/tables/financial-entries"

describe("table preference routes", () => {
  test("anonymous callers get 401 on every route", async () => {
    for (const [method, path] of [["GET", base], ["PUT", `${base}/views/x`], ["DELETE", `${base}/views/x`]]) {
      expect([method, (await send(null, method, path, {})).status]).toEqual([method, 401])
    }
  })

  test("any signed-in user may list, save and delete their own views, whatever their permissions", async () => {
    for (const token of ["ana", "bruno"]) {
      expect((await send(token, "GET", base)).status).toBe(200)
      const saved = await send(token, "PUT", `${base}/views/Pendentes`, { pageSize: 50, filters: { status: ["open"] } })
      expect(saved.status).toBe(200)
      expect(await saved.json()).toMatchObject({ name: "Pendentes", pageSize: 50, filters: { status: ["open"] }, isDefault: false })
      expect((await send(token, "DELETE", `${base}/views/Pendentes`)).status).toBe(200)
    }
  })

  test("views are private to the user and the name is URL decoded", async () => {
    await send("ana", "PUT", `${base}/views/${encodeURIComponent("A receber / hoje")}`, {})
    expect(await (await send("ana", "GET", base)).json()).toEqual({
      items: [expect.objectContaining({ name: "A receber / hoje" })],
    })
    expect(await (await send("bruno", "GET", base)).json()).toEqual({ items: [] })
    expect((await send("bruno", "DELETE", `${base}/views/${encodeURIComponent("A receber / hoje")}`)).status).toBe(404)
  })

  test("invalid input is 422 with a pt-BR message, including a body that is not JSON", async () => {
    for (const body of [{ pageSize: 0 }, { sort: "x" }, "not json"]) {
      const response = await send("ana", "PUT", `${base}/views/x`, body)
      expect(response.status).toBe(422)
      expect((await response.json()).error.code).toBe("validation_error")
    }
    expect((await send("ana", "GET", "/api/v1/preferences/tables/Bad_Key")).status).toBe(422)
  })

  test("only the three routes and methods are open: everything else is denied", async () => {
    for (const [method, path] of [
      ["POST", base], ["PUT", base], ["DELETE", base], ["GET", `${base}/views/x`], ["PATCH", `${base}/views/x`],
      ["GET", "/api/v1/preferences"], ["GET", "/api/v1/preferences/tables"], ["GET", `${base}/views/x/extra`],
    ]) {
      expect([method, path, (await send("ana", method, path, {})).status]).toEqual([method, path, 403])
    }
  })

  test("permissionFor marks the three routes as session-only and nothing else", () => {
    expect(permissionFor(base, "GET")).toBe(AUTHENTICATED)
    expect(permissionFor(`${base}/views/x`, "PUT")).toBe(AUTHENTICATED)
    expect(permissionFor(`${base}/views/x`, "DELETE")).toBe(AUTHENTICATED)
    expect(permissionFor(base, "PUT")).toBeNull()
    expect(permissionFor(`${base}/views/x`, "GET")).toBeNull()
    expect(permissionFor("/api/v1/preferences/tables/x/y", "GET")).toBeNull()
  })
})
