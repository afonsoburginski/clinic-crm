import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type { FinancialRecord } from "@/application/ports/financial"
import { createFinancialUseCases } from "@/application/use-cases/financial"
import { createFinancialRouter } from "@/presentation/routes/financial"
import type { ApiEnv } from "@/presentation/routes/shared"
import { FakeFinancialRepository } from "./fakes/financial-repository"

const previousClinicId = Bun.env.CLINIC_ID
beforeAll(() => { Bun.env.CLINIC_ID = "clinic" })
afterAll(() => {
  if (previousClinicId === undefined) delete Bun.env.CLINIC_ID
  else Bun.env.CLINIC_ID = previousClinicId
})

const today = new Date().toISOString().slice(0, 10)
const payment = { id: "pay1", amountCents: 4_000, paidAt: "2025-02-01", requestId: "r0", reversedAt: null }
const base: FinancialRecord = {
  id: "e1", amountCents: 10_000, competence: "2025-02", dueDate: "2099-01-01", type: "income", status: "draft",
}

function setup(records: FinancialRecord[] = [base]) {
  const repository = new FakeFinancialRepository()
  repository.records = records
  const app = new Hono<ApiEnv>()
  app.use("*", async (c, next) => {
    c.set("auth", { userId: "user-1", user: { roles: ["finance"] } })
    await next()
  })
  app.route("/", createFinancialRouter(createFinancialUseCases(repository)))
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { repository, send }
}

const error = (code: string, message: string) => ({ error: { code, message } })

describe("financial router", () => {
  test("summarises entries and totals per type, ignoring cancelled ones", async () => {
    const { send } = setup([
      base,
      { ...base, id: "e2", amountCents: 500, type: "expense" },
      { ...base, id: "e3", amountCents: 900, status: "cancelled" },
    ])
    const response = await send("GET", "/api/v1/financial/summary")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [base, { ...base, id: "e2", amountCents: 500, type: "expense" }, { ...base, id: "e3", amountCents: 900, status: "cancelled" }],
      totals: { income: 10_000, expense: 500 },
    })
  })

  test("lists entries with query filters", async () => {
    const { repository, send } = setup()
    const response = await send("GET", "/api/v1/financial/entries?patientId=p1&status=draft&from=2025-01-01&to=2025-02-01")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [base] })
    expect(repository.found[0]).toEqual({
      clinicId: "clinic",
      filters: { patientId: "p1", status: "draft", from: "2025-01-01", to: "2025-02-01" },
    })
  })

  test("creates an entry with 201 and rejects an invalid one", async () => {
    const { send } = setup()
    const created = await send("POST", "/api/v1/financial/entries", { amountCents: 5_000, competence: "2025-03" })
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({
      id: "new", amountCents: 5_000, competence: "2025-03", createdBy: "user-1", status: "draft",
    })
    const invalid = await send("POST", "/api/v1/financial/entries", { amountCents: 0, competence: "2025-03" })
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toEqual(error("validation_error", "validation"))
  })

  test("reads and patches an entry", async () => {
    const { send } = setup()
    const one = await send("GET", "/api/v1/financial/entries/e1")
    expect(one.status).toBe(200)
    expect(await one.json()).toEqual(base)
    const patched = await send("PATCH", "/api/v1/financial/entries/e1", { amountCents: 12_000, competence: "2025-02" })
    expect(patched.status).toBe(200)
    expect(await patched.json()).toEqual({ ...base, amountCents: 12_000 })
    const missing = await send("GET", "/api/v1/financial/entries/missing")
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual(error("not_found", "not_found"))
    expect((await send("PATCH", "/api/v1/financial/entries/missing", { amountCents: 1, competence: "2025-02" })).status).toBe(404)
  })

  test("registers a payment and replays it for the same request id", async () => {
    const { repository, send } = setup()
    const body = { requestId: "r1", amountCents: 4_000, paidAt: today, method: "pix" }
    const response = await send("POST", "/api/v1/financial/entries/e1/payments", body)
    expect(response.status).toBe(200)
    const created = await response.json()
    expect(created).toEqual({
      id: expect.any(String), amountCents: 4_000, paidAt: today, method: "pix", requestId: "r1", reversedAt: null, createdBy: "user-1",
    })
    repository.records = [{ ...base, payments: [created] }]
    const replay = await send("POST", "/api/v1/financial/entries/e1/payments", { ...body, amountCents: 1 })
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual(created)
    const invalid = await send("POST", "/api/v1/financial/entries/e1/payments", { ...body, requestId: "r2", amountCents: 999_999 })
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toEqual(error("validation_error", "validation"))
  })

  test("cancels an entry with a reason", async () => {
    const { send } = setup()
    const response = await send("POST", "/api/v1/financial/entries/e1/cancel", { reason: "Lançamento duplicado" })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "cancelled", cancelReason: "Lançamento duplicado" })
    const short = await send("POST", "/api/v1/financial/entries/e1/cancel", { reason: "x" })
    expect(short.status).toBe(422)
    const { send: paid } = setup([{ ...base, payments: [payment] }])
    const conflict = await paid("POST", "/api/v1/financial/entries/e1/cancel", { reason: "Lançamento duplicado" })
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual(error("conflict", "conflict"))
  })

  test("reverses a payment", async () => {
    const { send } = setup([{ ...base, payments: [payment] }])
    const response = await send("POST", "/api/v1/financial/payments/pay1/reverse", { reason: "Erro no caixa" })
    expect(response.status).toBe(200)
    expect((await response.json()).payments).toEqual([
      { ...payment, reversedAt: expect.any(String), reverseReason: "Erro no caixa", reversedBy: "user-1" },
    ])
    const unknown = await send("POST", "/api/v1/financial/payments/none/reverse", { reason: "Erro no caixa" })
    expect(unknown.status).toBe(404)
    const again = setup([{ ...base, payments: [{ ...payment, reversedAt: "2025-02-02" }] }])
    expect((await again.send("POST", "/api/v1/financial/payments/pay1/reverse", { reason: "Erro no caixa" })).status).toBe(409)
  })

  test("maps an unreadable body to the generic failure response", async () => {
    const { send } = setup()
    for (const [path, method] of [
      ["/api/v1/financial/entries", "POST"],
      ["/api/v1/financial/entries/e1", "PATCH"],
      ["/api/v1/financial/entries/e1/payments", "POST"],
      ["/api/v1/financial/entries/e1/cancel", "POST"],
      ["/api/v1/financial/payments/pay1/reverse", "POST"],
    ]) {
      const response = await send(method, path)
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual(error("internal_error", "Falha ao acessar os dados."))
    }
  })
})
