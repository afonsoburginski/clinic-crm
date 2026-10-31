import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type { DocumentRecord } from "@/application/ports/documents"
import { createDocumentUseCases } from "@/application/use-cases/documents"
import { createDocumentsRouter } from "@/presentation/routes/documents"
import type { ApiEnv } from "@/presentation/routes/shared"
import { FakeDocumentRepository } from "./fakes/documents-repository"
import { FakePatientAccess } from "./fakes/patient-access"
import { FakePermissions } from "./fakes/permissions"

const previousClinicId = Bun.env.CLINIC_ID
beforeAll(() => { Bun.env.CLINIC_ID = "clinic" })
afterAll(() => {
  if (previousClinicId === undefined) delete Bun.env.CLINIC_ID
  else Bun.env.CLINIC_ID = previousClinicId
})

const base: DocumentRecord = {
  id: "d1", patientId: "p1", title: "Laudo", classification: "clinical", status: "draft", clinicalRecordId: "cr1",
}

function setup(user: { roles: string[]; professionalId?: string } = { roles: ["admin"] }, records = [base]) {
  const repository = new FakeDocumentRepository()
  repository.records = records
  repository.clinicalRecords = [{ id: "cr1", patientId: "p1", status: "finalized" }]
  repository.guardians.add("p1:g1")
  const access = new FakePatientAccess()
  access.linkedPatients.add("p1")
  const permissions = new FakePermissions()
  permissions.granted = new Set(["clinical:read"])
  const app = new Hono<ApiEnv>()
  app.use("*", async (c, next) => {
    c.set("auth", { userId: "user-1", user })
    await next()
  })
  app.route("/", createDocumentsRouter(createDocumentUseCases(repository, access, permissions)))
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { repository, access, permissions, send }
}

const error = (code: string, message: string) => ({ error: { code, message } })

describe("documents router", () => {
  test("lists the documents the actor may read, with query filters, scoped for professionals", async () => {
    const financial = { ...base, id: "d2", classification: "financial" }
    const { repository, send } = setup({ roles: ["professional"], professionalId: "pr1" }, [base, financial])
    const response = await send("GET", "/api/v1/documents?patientId=p1&status=draft&from=2025-01-01&to=2025-02-01")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [base] })
    expect(repository.found[0]).toEqual({
      clinicId: "clinic",
      filters: { patientId: "p1", status: "draft", from: "2025-01-01", to: "2025-02-01" },
      professionalId: "pr1",
    })
  })

  test("creates a document with 201 and rejects an invalid one", async () => {
    const { send } = setup()
    const body = { patientId: "p1", title: "Laudo", classification: "clinical" }
    const created = await send("POST", "/api/v1/documents", body)
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ id: "new", ...body, createdBy: "user-1", status: "draft" })
    const invalid = await send("POST", "/api/v1/documents", { ...body, classification: "legal" })
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toEqual(error("validation_error", "validation"))
  })

  test("reads and patches a document", async () => {
    const { send } = setup()
    const one = await send("GET", "/api/v1/documents/d1")
    expect(one.status).toBe(200)
    expect(await one.json()).toEqual(base)
    const patched = await send("PATCH", "/api/v1/documents/d1", { patientId: "p1", title: "Novo", classification: "clinical" })
    expect(patched.status).toBe(200)
    expect(await patched.json()).toEqual({ ...base, title: "Novo" })
    const missing = await send("GET", "/api/v1/documents/missing")
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual(error("not_found", "not_found"))
  })

  test("changes the status", async () => {
    const { send } = setup()
    const issued = await send("POST", "/api/v1/documents/d1/status", { status: "issued" })
    expect(issued.status).toBe(200)
    expect(await issued.json()).toEqual({ ...base, status: "issued" })
    const again = setup({ roles: ["admin"] }, [{ ...base, status: "issued" }])
    const conflict = await again.send("POST", "/api/v1/documents/d1/status", { status: "issued" })
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual(error("conflict", "conflict"))
  })

  test("adds and revokes a release", async () => {
    const { repository, send } = setup({ roles: ["admin"] }, [{ ...base, status: "issued" }])
    const added = await send("POST", "/api/v1/documents/d1/releases", { guardianId: "g1" })
    expect(added.status).toBe(200)
    const [release] = (await added.json()).releases
    expect(release).toMatchObject({ guardianId: "g1", active: true, createdBy: "user-1" })
    const forbidden = await send("POST", "/api/v1/documents/d1/releases", { guardianId: "g9" })
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual(error("forbidden", "forbidden"))

    repository.records = [{ ...base, status: "issued", releases: [release] }]
    const revoked = await send("POST", `/api/v1/documents/d1/releases/${release.id}/revoke`, { reason: "Pedido do responsável" })
    expect(revoked.status).toBe(200)
    expect((await revoked.json()).releases).toEqual([
      { ...release, active: false, revokedAt: expect.any(String), revokedBy: "user-1", reason: "Pedido do responsável" },
    ])
    const short = await send("POST", `/api/v1/documents/d1/releases/${release.id}/revoke`, { reason: "curt" })
    expect(short.status).toBe(422)
    expect(await short.json()).toEqual(error("validation_error", "validation"))
    const unknown = await send("POST", "/api/v1/documents/d1/releases/none/revoke", { reason: "Pedido do responsável" })
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual(error("not_found", "not_found"))
  })

  test("keeps the professional-patient access check where it was", async () => {
    const { repository, access, permissions, send } = setup({ roles: ["professional"], professionalId: "pr1" }, [
      base,
      { ...base, id: "d2", classification: "financial" },
    ])
    access.linkedPatients.clear()
    const forbidden: Array<[string, string, unknown?]> = [
      ["POST", "/api/v1/documents", { patientId: "p1", title: "Laudo", classification: "clinical" }],
      ["GET", "/api/v1/documents/d1"],
      ["POST", "/api/v1/documents/d1/status", { status: "issued" }],
      ["POST", "/api/v1/documents/d1/releases", { guardianId: "g1" }],
    ]
    for (const [method, path, body] of forbidden) {
      const response = await send(method, path, body)
      expect([method, path, response.status]).toEqual([method, path, 403])
      expect(await response.json()).toEqual(error("forbidden", "forbidden"))
    }
    expect(repository.inserted).toEqual([])
    expect(repository.changed).toEqual([])
    // Not clinical: no patient access check, but the classification permission still gates the read.
    expect((await send("GET", "/api/v1/documents/d2")).status).toBe(403)
    permissions.granted.add("finance:read")
    expect((await send("GET", "/api/v1/documents/d2")).status).toBe(200)
    expect((await send("POST", "/api/v1/documents", { patientId: "p9", title: "Recibo", classification: "financial" })).status).toBe(201)
  })

  test("maps an unreadable body to the generic failure response", async () => {
    const { send } = setup()
    for (const [path, method] of [
      ["/api/v1/documents", "POST"],
      ["/api/v1/documents/d1", "PATCH"],
      ["/api/v1/documents/d1/status", "POST"],
      ["/api/v1/documents/d1/releases", "POST"],
      ["/api/v1/documents/d1/releases/r1/revoke", "POST"],
    ]) {
      const response = await send(method, path)
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual(error("internal_error", "Falha ao acessar os dados."))
    }
  })
})
