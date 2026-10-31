import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type { Assessment } from "@/application/ports/assessments"
import { createAssessmentUseCases } from "@/application/use-cases/assessments"
import { createAssessmentsRouter } from "@/presentation/routes/assessments"
import type { ApiEnv } from "@/presentation/routes/shared"
import { FakeAssessmentRepository } from "./fakes/assessments-repository"
import { FakePatientAccess } from "./fakes/patient-access"

const previousClinicId = Bun.env.CLINIC_ID
beforeAll(() => { Bun.env.CLINIC_ID = "clinic" })
afterAll(() => {
  if (previousClinicId === undefined) delete Bun.env.CLINIC_ID
  else Bun.env.CLINIC_ID = previousClinicId
})

const interpretation = "Resultados compatíveis com o perfil esperado."
const base: Assessment = {
  id: "a1",
  patientId: "p1",
  status: "in_progress",
  stages: [{ id: "s1", status: "pending" }],
  interpretations: [],
}

function setup(user: { roles: string[]; professionalId?: string } = { roles: ["admin"] }) {
  const repository = new FakeAssessmentRepository()
  repository.records = [base]
  const access = new FakePatientAccess()
  access.linkedPatients.add("p1")
  const app = new Hono<ApiEnv>()
  app.use("*", async (c, next) => {
    c.set("auth", { userId: "user-1", user })
    await next()
  })
  app.route("/", createAssessmentsRouter(createAssessmentUseCases(repository, access)))
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { repository, access, send }
}

const error = (code: string, message: string) => ({ error: { code, message } })

describe("assessments router", () => {
  test("lists assessments with query filters, scoped for professionals", async () => {
    const { repository, send } = setup({ roles: ["professional"], professionalId: "pr1" })
    const response = await send("GET", "/api/v1/assessments?patientId=p1&status=in_progress&from=2025-01-01&to=2025-02-01")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [base] })
    expect(repository.found[0]).toEqual({
      clinicId: "clinic",
      filters: { patientId: "p1", status: "in_progress", from: "2025-01-01", to: "2025-02-01" },
      professionalId: "pr1",
    })
  })

  test("creates an assessment with 201", async () => {
    const { repository, send } = setup()
    const response = await send("POST", "/api/v1/assessments", { patientId: "p1", name: "WISC" })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: "new", patientId: "p1", name: "WISC", createdBy: "user-1", status: "pending" })
    expect(repository.inserted[0]).toMatchObject({ clinicId: "clinic", actorId: "user-1" })
    const invalid = await send("POST", "/api/v1/assessments", { name: "WISC" })
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toEqual(error("validation_error", "validation"))
  })

  test("reads and patches a single assessment", async () => {
    const { repository, send } = setup()
    const one = await send("GET", "/api/v1/assessments/a1")
    expect(one.status).toBe(200)
    expect(await one.json()).toEqual(base)
    const patched = await send("PATCH", "/api/v1/assessments/a1", { patientId: "p1", name: "Novo" })
    expect(patched.status).toBe(200)
    expect(await patched.json()).toEqual({ ...base, name: "Novo" })
    expect(repository.patched[0]).toMatchObject({ id: "a1", actorId: "user-1" })
    const missing = await send("GET", "/api/v1/assessments/missing")
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual(error("not_found", "not_found"))
  })

  test("answers 409 when patching a completed or cancelled assessment", async () => {
    const { repository, send } = setup()
    for (const status of ["completed", "cancelled"]) {
      repository.records = [{ ...base, status }]
      const response = await send("PATCH", "/api/v1/assessments/a1", { patientId: "p1", stages: [] })
      expect([status, response.status]).toEqual([status, 409])
      expect(await response.json()).toEqual(error("conflict", "conflict"))
    }
    expect(repository.patched).toEqual([])
  })

  test("answers 403 instead of listing everything for a professional without a professional link", async () => {
    const { repository, send } = setup({ roles: ["professional"] })
    const response = await send("GET", "/api/v1/assessments")
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(error("forbidden", "forbidden"))
    expect(repository.found).toEqual([])
  })

  test("falls back to pending when the body asks for a completed assessment", async () => {
    const { repository, send } = setup()
    const response = await send("POST", "/api/v1/assessments", { patientId: "p1", status: "completed" })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ status: "pending" })
    expect(repository.inserted[0].payload.status).toBe("pending")
  })

  test("advances a stage", async () => {
    const { send } = setup()
    const response = await send("POST", "/api/v1/assessments/a1/stages", { stageId: "s1", status: "in_progress" })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.stages).toEqual([{ id: "s1", status: "in_progress", updatedBy: "user-1" }])
    expect(body.events).toEqual([{ action: "stages", actor: "user-1", at: expect.any(String) }])
    const invalid = await send("POST", "/api/v1/assessments/a1/stages", { stageId: "s1", status: "completed" })
    expect(invalid.status).toBe(409)
    expect(await invalid.json()).toEqual(error("conflict", "conflict"))
    const unknown = await send("POST", "/api/v1/assessments/a1/stages", { stageId: "nope", status: "in_progress" })
    expect(unknown.status).toBe(404)
  })

  test("adds an interpretation", async () => {
    const { send } = setup()
    const response = await send("POST", "/api/v1/assessments/a1/interpretations", { content: interpretation })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.interpretations).toEqual([
      { id: expect.any(String), version: 1, content: interpretation, createdBy: "user-1", at: expect.any(String) },
    ])
    const short = await send("POST", "/api/v1/assessments/a1/interpretations", { content: "curto" })
    expect(short.status).toBe(422)
    expect(await short.json()).toEqual(error("validation_error", "validation"))
  })

  test("completes a ready assessment and refuses an unready one", async () => {
    const { repository, send } = setup()
    expect((await send("POST", "/api/v1/assessments/a1/complete", {})).status).toBe(409)
    repository.records = [{ ...base, stages: [{ id: "s1", status: "completed" }], interpretations: [{ id: "i1" }] }]
    const response = await send("POST", "/api/v1/assessments/a1/complete", {})
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "completed" })
  })

  test("cancels with a reason", async () => {
    const { send } = setup()
    const response = await send("POST", "/api/v1/assessments/a1/cancel", { reason: "Paciente desistiu" })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "cancelled", cancelReason: "Paciente desistiu" })
    const short = await send("POST", "/api/v1/assessments/a1/cancel", { reason: "ruim" })
    expect(short.status).toBe(422)
  })

  test("keeps the professional-patient access check on every route", async () => {
    const { repository, access, send } = setup({ roles: ["professional"], professionalId: "pr1" })
    access.linkedPatients.clear()
    const calls: Array<[string, string, unknown?]> = [
      ["POST", "/api/v1/assessments", { patientId: "p1" }],
      ["GET", "/api/v1/assessments/a1"],
      ["PATCH", "/api/v1/assessments/a1", { patientId: "p1" }],
      ["POST", "/api/v1/assessments/a1/stages", { stageId: "s1", status: "in_progress" }],
      ["POST", "/api/v1/assessments/a1/interpretations", { content: interpretation }],
      ["POST", "/api/v1/assessments/a1/complete", {}],
      ["POST", "/api/v1/assessments/a1/cancel", { reason: "Paciente desistiu" }],
    ]
    for (const [method, path, body] of calls) {
      const response = await send(method, path, body)
      expect([method, path, response.status]).toEqual([method, path, 403])
      expect(await response.json()).toEqual(error("forbidden", "forbidden"))
    }
    expect(repository.inserted).toEqual([])
    expect(repository.patched).toEqual([])
  })

  test("maps an unreadable body to the generic failure response", async () => {
    const { send } = setup()
    for (const [path, method] of [
      ["/api/v1/assessments", "POST"],
      ["/api/v1/assessments/a1", "PATCH"],
      ["/api/v1/assessments/a1/stages", "POST"],
      ["/api/v1/assessments/a1/interpretations", "POST"],
      ["/api/v1/assessments/a1/complete", "POST"],
      ["/api/v1/assessments/a1/cancel", "POST"],
    ]) {
      const response = await send(method, path)
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual(error("internal_error", "Falha ao acessar os dados."))
    }
  })
})
