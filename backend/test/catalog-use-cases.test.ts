import { describe, expect, test } from "bun:test"
import { createCatalogCommands, createCatalogQueries } from "@/application/use-cases/catalog"
import { FakeCatalogRepository } from "./fakes/catalog-repository"

const clinicId = "clinic"

describe("catalog queries", () => {
  test("lists items of a kind with the request filters", async () => {
    const repository = new FakeCatalogRepository()
    repository.items.room = [{ id: "r1", name: "Sala 1" }]
    const filters = { patientId: "p", status: "draft", from: "2025-01-01", to: "2025-02-01" }
    const items = await createCatalogQueries(repository).listItems({ clinicId, kind: "room", filters })
    expect(items).toEqual([{ id: "r1", name: "Sala 1" }])
    expect(repository.listed).toEqual({ clinicId, resource: "room", filters })
  })

  test("gets an item or reports not_found", async () => {
    const repository = new FakeCatalogRepository()
    repository.items.professional = [{ id: "pr1", name: "Helena" }]
    const queries = createCatalogQueries(repository)
    expect(await queries.getItem({ clinicId, kind: "professional", id: "pr1" })).toEqual({ id: "pr1", name: "Helena" })
    await expect(queries.getItem({ clinicId, kind: "professional", id: "missing" })).rejects.toThrow("not_found")
    await expect(queries.getItem({ clinicId, kind: "service", id: "pr1" })).rejects.toThrow("not_found")
  })

  test("returns the latest settings, or an empty object when none exist", async () => {
    const repository = new FakeCatalogRepository()
    const queries = createCatalogQueries(repository)
    expect(await queries.getSettings({ clinicId })).toEqual({})
    expect(repository.listed).toEqual({ clinicId, resource: "settings", filters: {} })
    repository.items.settings = [{ id: "s2", name: "Nova" }, { id: "s1", name: "Antiga" }]
    expect(await queries.getSettings({ clinicId })).toEqual({ id: "s2", name: "Nova" })
  })

  test("passes audit filters through", async () => {
    const repository = new FakeCatalogRepository()
    repository.events = [{ actorId: "u", at: new Date(0), action: "update", resource: "room", resourceId: "r", summary: "Alterou room", changes: null }]
    const query = { clinicId, resource: "room", actorId: "u" }
    expect(await createCatalogQueries(repository).listAuditEvents(query)).toEqual(repository.events)
    expect(repository.auditQuery).toEqual(query)
  })
})

describe("catalog commands", () => {
  test("creates an item with creator and draft status defaults plus an audit entry", async () => {
    const repository = new FakeCatalogRepository()
    const created = await createCatalogCommands(repository).createItem({
      clinicId, kind: "service", actorId: "user-1", body: { name: "Consulta" },
    })
    expect(created).toEqual({ id: "new", name: "Consulta", createdBy: "user-1", status: "draft" })
    expect(repository.inserted).toEqual([{
      clinicId,
      resource: "service",
      actorId: "user-1",
      payload: { name: "Consulta", createdBy: "user-1", status: "draft" },
      audit: { action: "create", summary: "Alterou service", changes: [{ field: "name", from: null, to: null }] },
    }])
  })

  test("keeps createdBy and status supplied by the client", async () => {
    const repository = new FakeCatalogRepository()
    await createCatalogCommands(repository).createItem({
      clinicId, kind: "room", actorId: "user-1", body: { createdBy: "import", status: "active" },
    })
    expect(repository.inserted[0]?.payload).toEqual({ createdBy: "import", status: "active" })
  })

  test("rejects bodies that are not JSON objects", async () => {
    const repository = new FakeCatalogRepository()
    const commands = createCatalogCommands(repository)
    for (const body of [null, 0, "text", true, undefined, []]) {
      await expect(commands.createItem({ clinicId, kind: "room", actorId: "u", body })).rejects.toThrow("validation")
      await expect(commands.updateItem({ clinicId, kind: "room", id: "r", actorId: "u", body })).rejects.toThrow("validation")
      await expect(commands.saveSettings({ clinicId, actorId: "u", body })).rejects.toThrow("validation")
      await expect(commands.updateProfessionalSchedule({ clinicId, professionalId: "pr", actorId: "u", body })).rejects.toThrow("validation")
      await expect(commands.addProfessionalUnavailability({ clinicId, professionalId: "pr", actorId: "u", body })).rejects.toThrow("validation")
    }
    expect(repository.inserted).toEqual([])
    expect(repository.patched).toEqual([])
  })

  test("updates an item by patching it and audits the changed fields", async () => {
    const repository = new FakeCatalogRepository()
    repository.items.specialty = [{ id: "s1", name: "Psicologia", active: true }]
    const updated = await createCatalogCommands(repository).updateItem({
      clinicId, kind: "specialty", id: "s1", actorId: "user-1", body: { active: false },
    })
    expect(updated).toEqual({ id: "s1", name: "Psicologia", active: false })
    expect(repository.patched).toEqual([{
      clinicId,
      resource: "specialty",
      id: "s1",
      actorId: "user-1",
      patch: { active: false },
      audit: { action: "update", summary: "Alterou specialty", changes: [{ field: "active", from: null, to: null }] },
    }])
  })

  test("reports not_found when the item to update does not exist", async () => {
    const repository = new FakeCatalogRepository()
    await expect(createCatalogCommands(repository).updateItem({
      clinicId, kind: "room", id: "missing", actorId: "u", body: { name: "x" },
    })).rejects.toThrow("not_found")
  })

  test("replaces the professional schedule using the authenticated actor", async () => {
    const repository = new FakeCatalogRepository()
    repository.items.professional = [{ id: "pr1", name: "Helena", schedule: [] }]
    const schedule = [{ weekday: 1, start: "08:00", end: "12:00" }]
    const updated = await createCatalogCommands(repository).updateProfessionalSchedule({
      clinicId, professionalId: "pr1", actorId: "user-1", body: { schedule, ignored: true },
    })
    expect(updated).toEqual({ id: "pr1", name: "Helena", schedule })
    expect(repository.patched[0]).toMatchObject({
      resource: "professional", id: "pr1", actorId: "user-1", patch: { schedule },
      audit: { action: "update", changes: [{ field: "schedule", from: null, to: null }] },
    })
    await expect(createCatalogCommands(repository).updateProfessionalSchedule({
      clinicId, professionalId: "missing", actorId: "user-1", body: { schedule },
    })).rejects.toThrow("not_found")
    await expect(createCatalogCommands(repository).updateProfessionalSchedule({
      clinicId, professionalId: "pr1", actorId: "user-1", body: {},
    })).rejects.toThrow("validation")
  })

  test("appends an unavailability to the professional's stored list", async () => {
    const repository = new FakeCatalogRepository()
    repository.items.professional = [{ id: "pr1", unavailabilities: [{ id: "stored" }] }]
    const commands = createCatalogCommands(repository)
    const entry = { id: "u1", start: "2025-01-01T08:00:00Z", end: "2025-01-01T12:00:00Z", reason: "Congresso" }
    await commands.addProfessionalUnavailability({ clinicId, professionalId: "pr1", actorId: "user-1", body: entry })
    expect(repository.patched[0]).toMatchObject({
      actorId: "user-1", patch: { unavailabilities: [{ id: "stored" }, entry] },
    })
    await expect(commands.addProfessionalUnavailability({
      clinicId, professionalId: "missing", actorId: "user-1", body: entry,
    })).rejects.toThrow("not_found")
  })

  test("removes one unavailability from the stored list", async () => {
    const repository = new FakeCatalogRepository()
    repository.items.professional = [{ id: "pr1", unavailabilities: [{ id: "u1" }, { id: "u2" }] }]
    const commands = createCatalogCommands(repository)
    const updated = await commands.removeProfessionalUnavailability({
      clinicId, professionalId: "pr1", actorId: "user-1", unavailabilityId: "u1",
    })
    expect(updated).toEqual({ id: "pr1", unavailabilities: [{ id: "u2" }] })
    expect(repository.patched[0]).toMatchObject({ id: "pr1", actorId: "user-1", patch: { unavailabilities: [{ id: "u2" }] } })
    await commands.removeProfessionalUnavailability({
      clinicId, professionalId: "pr1", actorId: "user-1", unavailabilityId: "unknown",
    })
    expect(repository.patched[1]?.patch).toEqual({ unavailabilities: [{ id: "u1" }, { id: "u2" }] })
  })

  test("treats a professional without unavailabilities as empty and reports unknown professionals", async () => {
    const repository = new FakeCatalogRepository()
    repository.items.professional = [{ id: "pr1" }]
    const commands = createCatalogCommands(repository)
    await commands.removeProfessionalUnavailability({
      clinicId, professionalId: "pr1", actorId: "user-1", unavailabilityId: "u1",
    })
    expect(repository.patched[0]?.patch).toEqual({ unavailabilities: [] })
    await expect(commands.removeProfessionalUnavailability({
      clinicId, professionalId: "missing", actorId: "user-1", unavailabilityId: "u1",
    })).rejects.toThrow("not_found")
    expect(repository.patched).toHaveLength(1)
  })

  test("creates settings when none exist and patches the latest ones otherwise", async () => {
    const repository = new FakeCatalogRepository()
    const commands = createCatalogCommands(repository)
    const created = await commands.saveSettings({ clinicId, actorId: "user-1", body: { minLeadMinutes: 30 } })
    expect(created).toEqual({ id: "new", minLeadMinutes: 30, createdBy: "user-1", status: "draft" })
    expect(repository.inserted[0]).toMatchObject({
      resource: "settings", actorId: "user-1",
      audit: { action: "create", summary: "Alterou settings", changes: [{ field: "minLeadMinutes", from: null, to: null }] },
    })
    repository.items.settings = [{ id: "s2", minLeadMinutes: 10 }, { id: "s1" }]
    const updated = await commands.saveSettings({ clinicId, actorId: "user-1", body: { minLeadMinutes: 45 } })
    expect(updated).toEqual({ id: "s2", minLeadMinutes: 45 })
    expect(repository.patched[0]).toMatchObject({
      resource: "settings", id: "s2", actorId: "user-1", patch: { minLeadMinutes: 45 },
    })
    expect(repository.inserted).toHaveLength(1)
  })
})
