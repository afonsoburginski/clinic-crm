import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type { AbaRecord } from "@/application/ports/aba"
import { createAbaUseCases } from "@/application/use-cases/aba"
import { createAbaRouter } from "@/presentation/routes/aba"
import type { ApiEnv } from "@/presentation/routes/shared"
import { FakeAbaRepository } from "./fakes/aba-repository"
import { FakePatientAccess } from "./fakes/patient-access"

const previousClinicId = Bun.env.CLINIC_ID
beforeAll(() => { Bun.env.CLINIC_ID = "clinic" })
afterAll(() => {
  if (previousClinicId === undefined) delete Bun.env.CLINIC_ID
  else Bun.env.CLINIC_ID = previousClinicId
})

const criteria = "Responder ao nome em 8 de 10 tentativas."
const plan: AbaRecord = {
  id: "pl1",
  patientId: "p1",
  title: "Plano",
  status: "draft",
  goals: [{ id: "g1", status: "active", criteria, targetPercent: 80, consecutiveSessions: 1, progress: 0 }],
}
const session: AbaRecord = { id: "s1", patientId: "p1", date: "2025-02-01", measures: [{ goalId: "g1", percent: 90 }] }

function setup(user: { roles: string[]; professionalId?: string } = { roles: ["admin"] }) {
  const repository = new FakeAbaRepository()
  repository.records["aba-plan"] = [plan]
  repository.records["aba-session"] = [session]
  const access = new FakePatientAccess()
  access.linkedPatients.add("p1")
  const app = new Hono<ApiEnv>()
  app.use("*", async (c, next) => {
    c.set("auth", { userId: "user-1", user })
    await next()
  })
  app.route("/", createAbaRouter(createAbaUseCases(repository, access)))
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { repository, access, send }
}

const error = (code: string, message: string) => ({ error: { code, message } })

describe("aba router", () => {
  test("lists plans and sessions with query filters, scoped for professionals", async () => {
    const { repository, send } = setup({ roles: ["professional"], professionalId: "pr1" })
    const response = await send("GET", "/api/v1/aba/plans?patientId=p1&status=draft&from=2025-01-01&to=2025-02-01")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [plan] })
    expect(repository.found[0]).toEqual({
      clinicId: "clinic",
      kind: "aba-plan",
      filters: { patientId: "p1", status: "draft", from: "2025-01-01", to: "2025-02-01" },
      professionalId: "pr1",
    })
    const sessions = await send("GET", "/api/v1/aba/sessions")
    expect(await sessions.json()).toEqual({ items: [session] })
    expect(repository.found[1]).toMatchObject({ kind: "aba-session", professionalId: "pr1" })
  })

  test("creates plans and sessions with 201", async () => {
    const { send } = setup()
    const created = await send("POST", "/api/v1/aba/plans", { patientId: "p1", title: "Plano" })
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ id: "new", patientId: "p1", title: "Plano", createdBy: "user-1", status: "draft" })
    const invalid = await send("POST", "/api/v1/aba/plans", { patientId: "p1" })
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toEqual(error("validation_error", "validation"))
    const createdSession = await send("POST", "/api/v1/aba/sessions", { patientId: "p1" })
    expect(createdSession.status).toBe(201)
    expect(await createdSession.json()).toEqual({ id: "new", patientId: "p1", createdBy: "user-1", status: "draft" })
  })

  test("reads and patches plans and sessions", async () => {
    const { send } = setup()
    const one = await send("GET", "/api/v1/aba/plans/pl1")
    expect(one.status).toBe(200)
    expect(await one.json()).toEqual(plan)
    const patched = await send("PATCH", "/api/v1/aba/plans/pl1", { patientId: "p1", title: "Novo" })
    expect(patched.status).toBe(200)
    expect(await patched.json()).toEqual({ ...plan, title: "Novo" })
    const missing = await send("GET", "/api/v1/aba/plans/missing")
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual(error("not_found", "not_found"))
    expect(await (await send("GET", "/api/v1/aba/sessions/s1")).json()).toEqual(session)
    const patchedSession = await send("PATCH", "/api/v1/aba/sessions/s1", { note: "n" })
    expect(await patchedSession.json()).toEqual({ ...session, note: "n" })
  })

  test("reports the goals of a plan with their progress", async () => {
    const { repository, send } = setup({ roles: ["professional"], professionalId: "pr1" })
    const response = await send("GET", "/api/v1/aba/plans/pl1/goals")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [{ id: "g1", status: "completed", criteria, targetPercent: 80, consecutiveSessions: 1, progress: 90 }],
    })
    expect(repository.found[0]).toEqual({
      clinicId: "clinic", kind: "aba-session", filters: { patientId: "p1" }, professionalId: "pr1",
    })
  })

  test("updates a goal with PATCH", async () => {
    const { send } = setup()
    const response = await send("PATCH", "/api/v1/aba/plans/pl1/goals/g1", { status: "paused", targetPercent: 70 })
    expect(response.status).toBe(200)
    expect((await response.json()).goals).toEqual([
      { id: "g1", status: "active", criteria, targetPercent: 70, consecutiveSessions: 1, progress: 0, goalId: "g1" },
    ])
    const invalid = await send("PATCH", "/api/v1/aba/plans/pl1/goals/g1", { targetPercent: 101 })
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toEqual(error("validation_error", "validation"))
    const unknown = await send("PATCH", "/api/v1/aba/plans/pl1/goals/none", {})
    expect(unknown.status).toBe(404)
  })

  test("activates, closes and adds goals to a plan", async () => {
    const { send } = setup()
    const activated = await send("POST", "/api/v1/aba/plans/pl1/activate", {})
    expect(activated.status).toBe(200)
    expect(await activated.json()).toMatchObject({ status: "active" })
    const closed = await send("POST", "/api/v1/aba/plans/pl1/close", {})
    expect(closed.status).toBe(200)
    expect(await closed.json()).toMatchObject({ status: "closed", closedAt: expect.any(String) })
    const added = await send("POST", "/api/v1/aba/plans/pl1/goals", { criteria, targetPercent: 80, consecutiveSessions: 3 })
    expect(added.status).toBe(200)
    expect((await added.json()).goals[1]).toMatchObject({ criteria, status: "active", progress: 0, id: expect.any(String) })
    const invalid = await send("POST", "/api/v1/aba/plans/pl1/goals", { criteria: "curto" })
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toEqual(error("validation_error", "validation"))
  })

  test("maps rule failures to their status", async () => {
    const { repository, send } = setup()
    repository.records["aba-plan"] = [{ ...plan, status: "closed" }]
    const response = await send("POST", "/api/v1/aba/plans/pl1/activate", {})
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(error("conflict", "conflict"))
  })

  test("voids a session with a reason", async () => {
    const { send } = setup()
    const response = await send("POST", "/api/v1/aba/sessions/s1/void", { reason: "Registrado por engano" })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ voided: true, voidReason: "Registrado por engano" })
    const short = await send("POST", "/api/v1/aba/sessions/s1/void", { reason: "x" })
    expect(short.status).toBe(422)
  })

  test("keeps the professional-patient access check on every route", async () => {
    const { repository, access, send } = setup({ roles: ["professional"], professionalId: "pr1" })
    access.linkedPatients.clear()
    const calls: Array<[string, string, unknown?]> = [
      ["GET", "/api/v1/aba/plans/pl1/goals"],
      ["PATCH", "/api/v1/aba/plans/pl1/goals/g1", { status: "paused" }],
      ["POST", "/api/v1/aba/plans", { patientId: "p1", title: "Plano" }],
      ["GET", "/api/v1/aba/plans/pl1"],
      ["PATCH", "/api/v1/aba/plans/pl1", { patientId: "p1", title: "Plano" }],
      ["POST", "/api/v1/aba/sessions", { patientId: "p1" }],
      ["GET", "/api/v1/aba/sessions/s1"],
      ["PATCH", "/api/v1/aba/sessions/s1", {}],
      ["POST", "/api/v1/aba/plans/pl1/activate", {}],
      ["POST", "/api/v1/aba/plans/pl1/close", {}],
      ["POST", "/api/v1/aba/plans/pl1/goals", { criteria, targetPercent: 80, consecutiveSessions: 3 }],
      ["POST", "/api/v1/aba/sessions/s1/void", { reason: "Registrado por engano" }],
    ]
    for (const [method, path, body] of calls) {
      const response = await send(method, path, body)
      expect([method, path, response.status]).toEqual([method, path, 403])
      expect(await response.json()).toEqual(error("forbidden", "forbidden"))
    }
    expect(repository.inserted).toEqual([])
    expect(repository.changed).toEqual([])
  })

  test("maps an unreadable body to the generic failure response", async () => {
    const { send } = setup()
    for (const [path, method] of [
      ["/api/v1/aba/plans", "POST"],
      ["/api/v1/aba/plans/pl1", "PATCH"],
      ["/api/v1/aba/plans/pl1/goals/g1", "PATCH"],
      ["/api/v1/aba/plans/pl1/activate", "POST"],
      ["/api/v1/aba/plans/pl1/close", "POST"],
      ["/api/v1/aba/plans/pl1/goals", "POST"],
      ["/api/v1/aba/sessions", "POST"],
      ["/api/v1/aba/sessions/s1", "PATCH"],
      ["/api/v1/aba/sessions/s1/void", "POST"],
    ]) {
      const response = await send(method, path)
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual(error("internal_error", "Falha ao acessar os dados."))
    }
  })
})
