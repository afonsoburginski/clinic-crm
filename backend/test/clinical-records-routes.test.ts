import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type { ClinicalRecord } from "@/application/ports/clinical-records"
import { createClinicalRecordUseCases } from "@/application/use-cases/clinical-records"
import { createClinicalRecordsRouter } from "@/presentation/routes/clinical-records"
import type { ApiEnv } from "@/presentation/routes/shared"
import { FakeClinicalRecordRepository } from "./fakes/clinical-records-repository"
import { FakePatientAccess } from "./fakes/patient-access"

const previousClinicId = Bun.env.CLINIC_ID
beforeAll(() => { Bun.env.CLINIC_ID = "clinic" })
afterAll(() => {
  if (previousClinicId === undefined) delete Bun.env.CLINIC_ID
  else Bun.env.CLINIC_ID = previousClinicId
})

const content = "Paciente evoluiu bem durante a sessão."
const draft: ClinicalRecord = {
  id: "r1", patientId: "p1", type: "progress", status: "draft", title: "Sessão", content, createdBy: "user-1",
}

function setup(user: { roles: string[]; professionalId?: string } = { roles: ["admin"] }) {
  const repository = new FakeClinicalRecordRepository()
  repository.records = [draft]
  const access = new FakePatientAccess()
  access.linkedPatients.add("p1")
  const app = new Hono<ApiEnv>()
  app.use("*", async (c, next) => {
    c.set("auth", { userId: "user-1", user })
    await next()
  })
  app.route("/", createClinicalRecordsRouter(createClinicalRecordUseCases(repository, access)))
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { repository, access, send }
}

const error = (code: string, message: string) => ({ error: { code, message } })

describe("clinical records router", () => {
  test("lists clinical patients for the professional link", async () => {
    const { repository, send } = setup({ roles: ["professional"], professionalId: "pr1" })
    const response = await send("GET", "/api/v1/clinical/patients")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [draft] })
    expect(repository.found[0]).toEqual({ clinicId: "clinic", filters: {}, professionalId: "pr1" })
  })

  test("lists records with query filters", async () => {
    const { repository, send } = setup({ roles: ["professional"], professionalId: "pr1" })
    const response = await send("GET", "/api/v1/clinical-records?patientId=p1&status=draft&from=2025-01-01&to=2025-02-01")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [draft] })
    expect(repository.found[0]).toEqual({
      clinicId: "clinic",
      filters: { patientId: "p1", status: "draft", from: "2025-01-01", to: "2025-02-01" },
      professionalId: "pr1",
    })
  })

  test("creates a record with 201", async () => {
    const { repository, send } = setup()
    const response = await send("POST", "/api/v1/clinical-records", { patientId: "p1", type: "anamnesis" })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: "new", patientId: "p1", type: "anamnesis", createdBy: "user-1", status: "draft" })
    expect(repository.inserted[0]).toMatchObject({ clinicId: "clinic", actorId: "user-1" })
    const invalid = await send("POST", "/api/v1/clinical-records", { patientId: "p1", type: "other" })
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toEqual(error("validation_error", "validation"))
  })

  test("reads and patches a single record", async () => {
    const { repository, send } = setup()
    const one = await send("GET", "/api/v1/clinical-records/r1")
    expect(one.status).toBe(200)
    expect(await one.json()).toEqual(draft)
    const patched = await send("PATCH", "/api/v1/clinical-records/r1", { patientId: "p1", type: "progress", title: "Novo" })
    expect(patched.status).toBe(200)
    expect(await patched.json()).toEqual({ ...draft, title: "Novo" })
    expect(repository.patched[0]).toMatchObject({ id: "r1", actorId: "user-1", expectedStatus: "draft" })
    const missing = await send("GET", "/api/v1/clinical-records/missing")
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual(error("not_found", "not_found"))
  })

  test("answers 409 when patching a finalized record", async () => {
    const { repository, send } = setup()
    repository.records = [{ ...draft, status: "finalized" }]
    const response = await send("PATCH", "/api/v1/clinical-records/r1", { patientId: "p1", type: "progress" })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(error("conflict", "conflict"))
  })

  test("answers 422 when a patch tries to change the status, and never reaches the repository", async () => {
    const { repository, send } = setup()
    const response = await send("PATCH", "/api/v1/clinical-records/r1", { status: "finalized" })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual(error("validation_error", "validation"))
    expect(repository.patched).toEqual([])
  })

  test("answers 403 instead of listing everything for a professional without a professional link", async () => {
    const { repository, send } = setup({ roles: ["professional"] })
    for (const path of ["/api/v1/clinical-records", "/api/v1/clinical/patients"]) {
      const response = await send("GET", path)
      expect([path, response.status]).toEqual([path, 403])
      expect(await response.json()).toEqual(error("forbidden", "forbidden"))
    }
    expect(repository.found).toEqual([])
  })

  test("creates a draft even when the body asks for a finalized record", async () => {
    const { repository, send } = setup()
    const response = await send("POST", "/api/v1/clinical-records", { patientId: "p1", type: "progress", status: "finalized" })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ status: "draft" })
    expect(repository.inserted[0].payload.status).toBe("draft")
  })

  test("returns the version chain", async () => {
    const { repository, send } = setup()
    const v1 = { ...draft, id: "v1", status: "superseded", version: 1 }
    const v2 = { ...draft, id: "v2", parentId: "v1", version: 2 }
    repository.records = [v2, v1]
    const response = await send("GET", "/api/v1/clinical-records/v2/versions")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [v1, v2] })
  })

  test("finalizes the author's draft", async () => {
    const { repository, send } = setup()
    const response = await send("POST", "/api/v1/clinical-records/r1/finalize", {})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ...draft, status: "finalized" })
    expect(repository.patched[0]).toMatchObject({ id: "r1", patch: { status: "finalized" } })
  })

  test("answers 403 when someone else tries to finalize", async () => {
    const { repository, send } = setup()
    repository.records = [{ ...draft, createdBy: "user-2" }]
    const response = await send("POST", "/api/v1/clinical-records/r1/finalize", {})
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(error("forbidden", "forbidden"))
  })

  test("rectifies a finalized record", async () => {
    const { repository, send } = setup()
    repository.records = [{ ...draft, status: "finalized" }]
    const response = await send("POST", "/api/v1/clinical-records/r1/rectifications", { reason: "Corrigir a data da sessão" })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "draft", parentId: "r1", version: 2 })
    expect(repository.inserted[0]).toMatchObject({ clinicId: "clinic", actorId: "user-1" })
    const short = await send("POST", "/api/v1/clinical-records/r1/rectifications", { reason: "curto" })
    expect(short.status).toBe(422)
    expect(await short.json()).toEqual(error("validation_error", "validation"))
  })

  test("keeps the professional-patient access check on every route", async () => {
    const { repository, access, send } = setup({ roles: ["professional"], professionalId: "pr1" })
    access.linkedPatients.clear()
    const forbidden = error("forbidden", "forbidden")
    const calls: Array<[string, string, unknown?]> = [
      ["POST", "/api/v1/clinical-records", { patientId: "p1", type: "progress" }],
      ["GET", "/api/v1/clinical-records/r1"],
      ["PATCH", "/api/v1/clinical-records/r1", { patientId: "p1", type: "progress" }],
      ["GET", "/api/v1/clinical-records/r1/versions"],
      ["POST", "/api/v1/clinical-records/r1/finalize", {}],
      ["POST", "/api/v1/clinical-records/r1/rectifications", { reason: "Corrigir a data da sessão" }],
    ]
    for (const [method, path, body] of calls) {
      const response = await send(method, path, body)
      expect([method, path, response.status]).toEqual([method, path, 403])
      expect(await response.json()).toEqual(forbidden)
    }
    expect(repository.inserted).toEqual([])
    expect(repository.patched).toEqual([])
  })

  test("maps an unreadable body to the generic failure response", async () => {
    const { send } = setup()
    for (const [path, method] of [
      ["/api/v1/clinical-records", "POST"],
      ["/api/v1/clinical-records/r1", "PATCH"],
      ["/api/v1/clinical-records/r1/finalize", "POST"],
      ["/api/v1/clinical-records/r1/rectifications", "POST"],
    ]) {
      const response = await send(method, path)
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual(error("internal_error", "Falha ao acessar os dados."))
    }
  })
})
