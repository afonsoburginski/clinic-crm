import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { permissionFor, type Auth, type User } from "@/application/auth"
import { createFinancialReportUseCases } from "@/application/use-cases/financial-report"
import { createFinancialUseCases } from "@/application/use-cases/financial"
import type { SourceRow } from "@/domain/financial-report"
import { permissions } from "@/presentation/composition/permissions"
import { createAuthRouter } from "@/presentation/routes/auth"
import { createFinancialRouter } from "@/presentation/routes/financial"
import { createFinancialReportRouter } from "@/presentation/routes/financial-report"
import type { ApiEnv } from "@/presentation/routes/shared"
import { FakeFinancialRepository } from "./fakes/financial-repository"
import { FakeFinancialReportRepository } from "./fakes/financial-report-repository"

const previousClinicId = Bun.env.CLINIC_ID
beforeAll(() => { Bun.env.CLINIC_ID = "clinic" })
afterAll(() => {
  if (previousClinicId === undefined) delete Bun.env.CLINIC_ID
  else Bun.env.CLINIC_ID = previousClinicId
})

const user = (id: string, roles: string[], granted: string[]): User => ({ id, name: id, email: `${id}@c.com`, roles, permissions: granted })
const tokens: Record<string, User> = {
  finance: user("fin", ["finance"], ["finance:read", "finance:write", "finance:export"]),
  viewer: user("viewer", ["manager"], ["finance:read"]),
  exporter: user("exporter", ["manager"], ["finance:export"]),
  reception: user("rec", ["reception"], ["patients:read"]),
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

const row = (id: string, payload: Record<string, unknown> = {}): SourceRow => ({
  id,
  payload: { type: "income", description: "Sessão", category: "Consulta", competence: "2026-10", dueDate: "2026-10-20", amountCents: 10_000, payments: [], ...payload },
  createdAt: "2026-10-01T12:00:00.000Z",
})

let repository: FakeFinancialReportRepository
let send: (token: string | null, path: string) => Response | Promise<Response>
beforeEach(() => {
  repository = new FakeFinancialReportRepository()
  repository.rows = [row("e1", { amountCents: 10_000 }), row("e2", { amountCents: 2_500, type: "expense", category: "Aluguel" })]
  const legacy = new FakeFinancialRepository()
  legacy.records = [{ id: "legacy", amountCents: 1, competence: "2026-10", dueDate: "2026-10-20", type: "income", status: "open" }]
  const app = new Hono<ApiEnv>()
  app.route("/", createAuthRouter(fakeAuth))
  // The same order as routes/api.ts: the report router first, so `/entries/search` is not taken for `/entries/:id`.
  app.route("/", createFinancialReportRouter(createFinancialReportUseCases(repository, permissions)))
  app.route("/", createFinancialRouter(createFinancialUseCases(legacy)))
  send = (token, path) => app.request(path, { headers: token ? { authorization: `Bearer ${token}` } : {} })
})

const paths = [
  "/api/v1/financial/report",
  "/api/v1/financial/entries/search",
  "/api/v1/financial/export",
]

describe("permissionFor", () => {
  test("report and search need finance:read, export needs finance:export and only answers GET", () => {
    expect(permissionFor("/api/v1/financial/report", "GET")).toBe("finance:read")
    expect(permissionFor("/api/v1/financial/entries/search", "GET")).toBe("finance:read")
    expect(permissionFor("/api/v1/financial/export", "GET")).toBe("finance:export")
    expect(permissionFor("/api/v1/financial/export", "POST")).toBeNull()
    expect(permissionFor("/api/v1/financial/entries/e1/payments", "POST")).toBe("finance:write")
  })
})

describe("financial report routes", () => {
  test("anonymous callers get 401 on every route", async () => {
    for (const path of paths) expect((await send(null, path)).status).toBe(401)
  })

  test("a profile without finance permissions gets 403 on every route", async () => {
    for (const path of paths) expect((await send("reception", path)).status).toBe(403)
    expect(repository.scans).toEqual([])
  })

  test("finance:read opens the report and the search but not the export (403, nothing audited)", async () => {
    expect((await send("viewer", "/api/v1/financial/report")).status).toBe(200)
    expect((await send("viewer", "/api/v1/financial/entries/search")).status).toBe(200)
    const refused = await send("viewer", "/api/v1/financial/export")
    expect(refused.status).toBe(403)
    expect(repository.exports).toEqual([])
  })

  test("finance:export alone does not export: the use case also needs finance:read", async () => {
    const response = await send("exporter", "/api/v1/financial/export")
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: { code: "forbidden", message: "Seu perfil não pode exportar o financeiro." } })
    expect(repository.exports).toEqual([])
  })

  test("the report answers indicators, series, distributions and facets", async () => {
    const response = await send("finance", "/api/v1/financial/report?kind=income&from=2026-10-01&to=2026-10-31")
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(["bySituation", "byMethod", "facets", "indicators", "series"].sort())
    expect(body.indicators.entryCount).toBe(1)
    expect(body.series.granularity).toBe("day")
    expect(repository.scans[0].filters).toMatchObject({ kind: "income", from: "2026-10-01", to: "2026-10-31" })
  })

  test("`/entries/search` is served by the report router, not by `/entries/:id`", async () => {
    const response = await send("finance", "/api/v1/financial/entries/search?pageSize=1&sort=amount&dir=desc")
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ total: 2, page: 1, pageSize: 1 })
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ id: "e1", kind: "income", amountCents: 10_000 })
    // The entry route still answers for a real id.
    expect((await send("finance", "/api/v1/financial/entries/legacy")).status).toBe(200)
  })

  test("the export answers the filtered rows and audits the export with the count only", async () => {
    const response = await send("finance", "/api/v1/financial/export?kind=expense")
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.total).toBe(1)
    expect(body.items[0]).toMatchObject({ id: "e2", kind: "expense", category: "Aluguel", amountCents: 2_500 })
    expect(repository.exports).toEqual([{ clinicId: "clinic", actorId: "fin", count: 1 }])
  })

  test("invalid parameters are 422 with a pt-BR message", async () => {
    for (const path of ["/api/v1/financial/report?from=ontem", "/api/v1/financial/entries/search?page=0", "/api/v1/financial/export?minCents=-5"]) {
      const response = await send("finance", path)
      expect(response.status).toBe(422)
      const { error } = await response.json()
      expect(error.code).toBe("validation_error")
      expect(error.message).not.toBe("validation")
    }
    expect(repository.exports).toEqual([])
  })
})
