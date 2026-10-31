import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type { CatalogKind } from "@/application/ports/catalog"
import { createCatalogUseCases } from "@/application/use-cases/catalog"
import { createCatalogRouter } from "@/presentation/routes/catalog"
import type { ApiEnv } from "@/presentation/routes/shared"
import { FakeCatalogRepository } from "./fakes/catalog-repository"

const previousClinicId = Bun.env.CLINIC_ID
beforeAll(() => { Bun.env.CLINIC_ID = "clinic" })
afterAll(() => {
  if (previousClinicId === undefined) delete Bun.env.CLINIC_ID
  else Bun.env.CLINIC_ID = previousClinicId
})

function setup() {
  const repository = new FakeCatalogRepository()
  repository.items.professional = [{ id: "pr1", name: "Helena", unavailabilities: [{ id: "u1" }, { id: "u2" }] }]
  repository.items.room = [{ id: "r1", name: "Sala 1" }]
  const app = new Hono<ApiEnv>()
  app.use("*", async (c, next) => {
    c.set("auth", { userId: "user-1", user: { roles: ["admin"] } })
    await next()
  })
  app.route("/", createCatalogRouter(createCatalogUseCases(repository)))
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { repository, send }
}

describe("catalog router", () => {
  const collections: Array<[string, CatalogKind]> = [
    ["specialties", "specialty"],
    ["services", "service"],
    ["rooms", "room"],
    ["professionals", "professional"],
  ]
  test.each(collections)("serves the %s collection", async (path, kind) => {
    const { repository, send } = setup()
    const list = await send("GET", `/api/v1/${path}?status=draft&patientId=p&from=2025-01-01&to=2025-02-01`)
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual({ items: repository.items[kind] ?? [] })
    expect(repository.listed).toEqual({
      clinicId: "clinic", resource: kind, filters: { status: "draft", patientId: "p", from: "2025-01-01", to: "2025-02-01" },
    })

    const created = await send("POST", `/api/v1/${path}`, { name: "Novo" })
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ id: "new", name: "Novo", createdBy: "user-1", status: "draft" })
    expect(repository.inserted[0]).toMatchObject({ clinicId: "clinic", resource: kind, actorId: "user-1" })

    const missing = await send("GET", `/api/v1/${path}/missing`)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: { code: "not_found", message: "not_found" } })

    const invalid = await send("PATCH", `/api/v1/${path}/unknown-id`, "text")
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toEqual({ error: { code: "validation_error", message: "validation" } })
  })

  test("reads and patches a single item", async () => {
    const { repository, send } = setup()
    const one = await send("GET", "/api/v1/rooms/r1")
    expect(one.status).toBe(200)
    expect(await one.json()).toEqual({ id: "r1", name: "Sala 1" })
    const patched = await send("PATCH", "/api/v1/rooms/r1", { name: "Sala 2" })
    expect(patched.status).toBe(200)
    expect(await patched.json()).toEqual({ id: "r1", name: "Sala 2" })
    expect(repository.patched[0]).toMatchObject({ resource: "room", id: "r1", actorId: "user-1", patch: { name: "Sala 2" } })
    expect((await send("PATCH", "/api/v1/rooms/missing", { name: "x" })).status).toBe(404)
  })

  test("updates the professional schedule", async () => {
    const { repository, send } = setup()
    const schedule = [{ weekday: 1, start: "08:00", end: "12:00" }]
    const response = await send("PUT", "/api/v1/professionals/pr1/schedule", { schedule })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: "pr1", schedule })
    expect(repository.patched[0]).toMatchObject({ resource: "professional", id: "pr1", actorId: "user-1", patch: { schedule } })
    expect((await send("PUT", "/api/v1/professionals/missing/schedule", { schedule })).status).toBe(404)
    expect((await send("PUT", "/api/v1/professionals/pr1/schedule", {})).status).toBe(422)
  })

  test("adds and removes unavailabilities", async () => {
    const { repository, send } = setup()
    const entry = { id: "u3", start: "2025-01-01T08:00:00Z", end: "2025-01-01T12:00:00Z", reason: "Congresso" }
    const added = await send("POST", "/api/v1/professionals/pr1/unavailabilities", entry)
    expect(added.status).toBe(200)
    expect(await added.json()).toMatchObject({ id: "pr1", unavailabilities: [{ id: "u1" }, { id: "u2" }, entry] })
    expect(repository.patched[0]).toMatchObject({ actorId: "user-1" })

    const removed = await send("DELETE", "/api/v1/professionals/pr1/unavailabilities/u1")
    expect(removed.status).toBe(200)
    expect(await removed.json()).toEqual({ id: "pr1", name: "Helena", unavailabilities: [{ id: "u2" }] })
    expect(repository.patched[1]).toMatchObject({ id: "pr1", actorId: "user-1", patch: { unavailabilities: [{ id: "u2" }] } })
    expect((await send("DELETE", "/api/v1/professionals/missing/unavailabilities/u1")).status).toBe(404)
  })

  test("reads and saves settings", async () => {
    const { repository, send } = setup()
    const empty = await send("GET", "/api/v1/settings")
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual({})

    const created = await send("PUT", "/api/v1/settings", { minLeadMinutes: 30 })
    expect(created.status).toBe(200)
    expect(await created.json()).toEqual({ id: "new", minLeadMinutes: 30, createdBy: "user-1", status: "draft" })

    repository.items.settings = [{ id: "s1", minLeadMinutes: 30 }]
    const read = await send("GET", "/api/v1/settings")
    expect(await read.json()).toEqual({ id: "s1", minLeadMinutes: 30 })
    const updated = await send("PUT", "/api/v1/settings", { minLeadMinutes: 45 })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toEqual({ id: "s1", minLeadMinutes: 45 })
  })

  test("lists audit events with optional filters", async () => {
    const { repository, send } = setup()
    repository.events = [{ actorId: "u", at: new Date("2025-01-01T00:00:00Z"), action: "update", resource: "room", resourceId: "r1", summary: "Alterou room", changes: null }]
    const response = await send("GET", "/api/v1/audit?resource=room&actorId=u")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [{ actorId: "u", at: "2025-01-01T00:00:00.000Z", action: "update", resource: "room", resourceId: "r1", summary: "Alterou room", changes: null }],
    })
    expect(repository.auditQuery).toEqual({ clinicId: "clinic", resource: "room", actorId: "u" })
    await send("GET", "/api/v1/audit")
    expect(repository.auditQuery).toEqual({ clinicId: "clinic", resource: undefined, actorId: undefined })
  })

  test("maps an unreadable body to the generic failure response", async () => {
    const { send } = setup()
    const response = await send("POST", "/api/v1/rooms", undefined)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: { code: "internal_error", message: "Falha ao acessar os dados." } })
  })
})
