import { describe, expect, test } from "bun:test"
import type { DocumentRecord } from "@/application/ports/documents"
import type { Actor } from "@/application/ports/patient-access"
import {
  createDocumentCommands,
  createDocumentQueries,
  type DocumentRuntime,
} from "@/application/use-cases/documents"
import { FakeDocumentRepository } from "./fakes/documents-repository"
import { FakePatientAccess } from "./fakes/patient-access"
import { FakePermissions } from "./fakes/permissions"

const clinicId = "clinic"
const admin: Actor = { userId: "admin-1", roles: ["admin"] }
const professional: Actor = { userId: "pro-1", roles: ["professional"], professionalId: "pr1" }
const at = "2025-03-01T12:00:00.000Z"
const runtime: DocumentRuntime = { now: () => new Date(at), newId: () => "rel-new" }

function document(fields: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "d1", patientId: "p1", title: "Laudo", classification: "clinical", status: "draft", clinicalRecordId: "cr1", ...fields,
  }
}

function setup(...records: DocumentRecord[]) {
  const repository = new FakeDocumentRepository()
  repository.records = records
  repository.clinicalRecords = [{ id: "cr1", patientId: "p1", status: "finalized" }]
  repository.guardians.add("p1:g1")
  const access = new FakePatientAccess()
  access.linkedPatients.add("p1")
  const permissions = new FakePermissions()
  return {
    repository,
    access,
    permissions,
    queries: createDocumentQueries(repository, access, permissions),
    commands: createDocumentCommands(repository, access, runtime),
  }
}

describe("document queries", () => {
  const docs = [
    document({ id: "c" }),
    document({ id: "f", classification: "financial" }),
    document({ id: "a", classification: "administrative" }),
    document({ id: "u", classification: "other" }),
    document({ id: "n", classification: undefined }),
  ]

  test("scopes the list to the professional's own patients", async () => {
    const { repository, permissions, queries } = setup(...docs)
    permissions.granted = new Set(["clinical:read"])
    const filters = { patientId: "p1", status: "draft", from: "2025-01-01", to: "2025-02-01" }
    await queries.listDocuments({ clinicId, actor: professional, filters })
    expect(repository.found[0]).toEqual({ clinicId, filters, professionalId: "pr1" })
    await queries.listDocuments({ clinicId, actor: admin, filters: {} })
    expect(repository.found[1].professionalId).toBeUndefined()
  })

  test("forbids a professional without a professional link from listing, instead of listing everything", async () => {
    const { repository, queries } = setup(...docs)
    await expect(queries.listDocuments({ clinicId, actor: { userId: "u", roles: ["professional"] }, filters: {} }))
      .rejects.toThrow("forbidden")
    expect(repository.found).toEqual([])
  })

  test.each([
    ["clinical:read", ["c"]],
    ["finance:read", ["f"]],
    ["patients:read", ["a"]],
    ["documents:read", []],
  ])("with %s, shows only the documents it unlocks", async (permission, ids) => {
    const { permissions, queries } = setup(...docs)
    permissions.granted = new Set([permission])
    const items = await queries.listDocuments({ clinicId, actor: admin, filters: {} })
    expect(items.map((item) => item.id)).toEqual(ids)
  })

  test("with every permission, still hides an unknown classification", async () => {
    const { permissions, queries } = setup(...docs)
    permissions.granted = new Set(["clinical:read", "finance:read", "patients:read"])
    const items = await queries.listDocuments({ clinicId, actor: admin, filters: {} })
    expect(items.map((item) => item.id)).toEqual(["c", "f", "a"])
    expect(permissions.checked.every((entry) => entry.actor === admin)).toBe(true)
  })

  test("gets a clinical document after checking access to its patient", async () => {
    const { access, permissions, queries } = setup(document(), document({ id: "d2", patientId: "p2" }))
    permissions.granted = new Set(["clinical:read"])
    expect(await queries.getDocument({ clinicId, actor: professional, id: "d1" })).toEqual(document())
    expect(access.checked).toEqual([{ patientId: "p1", actor: professional }])
    await expect(queries.getDocument({ clinicId, actor: professional, id: "d2" })).rejects.toThrow("forbidden")
    await expect(queries.getDocument({ clinicId, actor: professional, id: "missing" })).rejects.toThrow("not_found")
  })

  test.each([
    ["clinical", "clinical:read"],
    ["financial", "finance:read"],
    ["administrative", "patients:read"],
  ])("a %s document is only returned with %s", async (classification, permission) => {
    const { permissions, queries } = setup(document({ classification }))
    const others = ["clinical:read", "finance:read", "patients:read", "documents:read"].filter((other) => other !== permission)
    for (const granted of [[], others]) {
      permissions.granted = new Set(granted)
      await expect(queries.getDocument({ clinicId, actor: admin, id: "d1" })).rejects.toThrow("forbidden")
    }
    permissions.granted = new Set([permission])
    expect(await queries.getDocument({ clinicId, actor: admin, id: "d1" })).toMatchObject({ id: "d1" })
    expect(permissions.checked.at(-1)).toEqual({ actor: admin, permission })
  })

  test("a clinical document of an unlinked patient is forbidden even with clinical:read", async () => {
    const { permissions, queries } = setup(document({ patientId: "p2" }))
    permissions.granted = new Set(["clinical:read"])
    await expect(queries.getDocument({ clinicId, actor: professional, id: "d1" })).rejects.toThrow("forbidden")
  })

  test("a document that is not clinical needs no access to its patient, only the classification permission", async () => {
    const { access, permissions, queries } = setup(document({ classification: "financial", patientId: "p2" }))
    permissions.granted = new Set(["finance:read"])
    expect(await queries.getDocument({ clinicId, actor: professional, id: "d1" })).toMatchObject({ id: "d1" })
    expect(access.checked).toEqual([])
  })

  test("an unknown or missing classification is unreadable by id, whatever the permissions", async () => {
    const { permissions, queries } = setup(document({ classification: "other" }), document({ id: "d2", classification: undefined }))
    permissions.granted = new Set(["clinical:read", "finance:read", "patients:read"])
    await expect(queries.getDocument({ clinicId, actor: admin, id: "d1" })).rejects.toThrow("forbidden")
    await expect(queries.getDocument({ clinicId, actor: admin, id: "d2" })).rejects.toThrow("forbidden")
  })
})

describe("document commands", () => {
  describe("create and update", () => {
    const body = { patientId: "p1", title: "Laudo", classification: "clinical" }

    test("creates a draft authored by the actor and audits the creation", async () => {
      const { repository, commands } = setup()
      expect(await commands.createDocument({ clinicId, actor: professional, body }))
        .toEqual({ id: "new", ...body, createdBy: "pro-1", status: "draft" })
      expect(repository.inserted[0]).toMatchObject({
        clinicId, actorId: "pro-1", audit: { action: "create", summary: "Alterou document" },
      })
    })

    test("legacy: a client-sent status and releases are stored as sent", async () => {
      const { commands } = setup()
      const created = await commands.createDocument({
        clinicId, actor: admin, body: { ...body, status: "issued", releases: [{ id: "r", active: true }] },
      })
      expect(created).toMatchObject({ status: "issued", releases: [{ id: "r", active: true }] })
    })

    test("checks patient access first, but only for clinical documents", async () => {
      const { access, commands } = setup()
      await expect(commands.createDocument({ clinicId, actor: professional, body: { ...body, patientId: "p2" } }))
        .rejects.toThrow("forbidden")
      await expect(commands.createDocument({ clinicId, actor: professional, body: { classification: "clinical" } }))
        .rejects.toThrow("forbidden")
      access.checked = []
      const other = { ...body, classification: "financial", patientId: "p2" }
      expect(await commands.createDocument({ clinicId, actor: professional, body: other })).toMatchObject({ patientId: "p2" })
      expect(access.checked).toEqual([])
    })

    test.each([
      ["no body", null],
      ["a list body", []],
      ["no patient", { ...body, patientId: undefined }],
      ["no title", { ...body, title: "" }],
      ["no classification", { ...body, classification: undefined }],
      ["an unknown classification", { ...body, classification: "legal" }],
    ])("rejects %s", async (_name, invalid) => {
      const { repository, commands } = setup(document())
      await expect(commands.createDocument({ clinicId, actor: admin, body: invalid })).rejects.toThrow("validation")
      await expect(commands.updateDocument({ clinicId, actor: admin, id: "d1", body: invalid })).rejects.toThrow("validation")
      expect(repository.inserted).toEqual([])
      expect(repository.changed).toEqual([])
    })

    const update = (id: string, patch: unknown, actor: Actor = professional) => ({ clinicId, actor, id, body: patch })

    test("updates a clinical document of a linked patient, auditing the update", async () => {
      const { repository, access, commands } = setup(document())
      const patch = { ...body, title: "Novo laudo" }
      expect(await commands.updateDocument(update("d1", patch))).toEqual({ ...document(), ...patch })
      expect(access.checked.map((entry) => entry.patientId)).toEqual(["p1", "p1"])
      expect(repository.changed[0]).toMatchObject({ id: "d1", actorId: "pro-1", audit: { action: "update", summary: "Alterou document" } })
    })

    test.each([
      ["status", { status: "issued" }],
      ["releases", { releases: [{ id: "r", guardianId: "g1", active: true }] }],
      ["an empty releases list", { releases: [] }],
      ["a null status", { status: null }],
    ])("refuses an update that carries %s, reserved to the dedicated actions", async (_name, reserved) => {
      const { repository, commands } = setup(document({ status: "issued", releases: [{ id: "r0", active: true }] }))
      await expect(commands.updateDocument(update("d1", { ...body, ...reserved }, admin))).rejects.toThrow("validation")
      expect(repository.changed).toEqual([])
    })

    test("forbids updating a clinical document of an unlinked patient", async () => {
      const { repository, commands } = setup(document({ patientId: "p2" }))
      await expect(commands.updateDocument(update("d1", body))).rejects.toThrow("forbidden")
      expect(repository.changed).toEqual([])
    })

    test("forbids a patch that makes a document clinical, or moves it, to an unlinked patient", async () => {
      const { repository, commands } = setup(
        document({ classification: "financial", patientId: "p1" }),
        document({ id: "d2" }),
      )
      await expect(commands.updateDocument(update("d1", { ...body, patientId: "p2" }))).rejects.toThrow("forbidden")
      await expect(commands.updateDocument(update("d2", { ...body, patientId: "p2" }))).rejects.toThrow("forbidden")
      expect(repository.changed).toEqual([])
    })

    test("a document that stays out of the clinical classification needs no access check", async () => {
      const { access, commands } = setup(document({ classification: "financial", patientId: "p2" }))
      const patch = { patientId: "p3", title: "Recibo", classification: "administrative" }
      expect(await commands.updateDocument(update("d1", patch))).toMatchObject({ ...patch, status: "draft" })
      expect(access.checked).toEqual([])
    })

    test("needs an authenticated actor", async () => {
      const { repository, commands } = setup(document())
      for (const actor of [{ userId: "system", roles: [] }, { userId: "", roles: [] }]) {
        await expect(commands.updateDocument(update("d1", body, actor))).rejects.toThrow("unauthorized")
      }
      expect(repository.changed).toEqual([])
    })

    test("reports an unknown document only for a valid update", async () => {
      const { commands } = setup()
      await expect(commands.updateDocument({ clinicId, actor: admin, id: "missing", body })).rejects.toThrow("not_found")
      await expect(commands.updateDocument({ clinicId, actor: admin, id: "missing", body: {} })).rejects.toThrow("validation")
    })
  })

  describe("status", () => {
    const status = (id: string, body: unknown, actor: Actor = professional) => ({ clinicId, actor, id, body })

    test("issues a draft once its clinical record of the same patient is finalized", async () => {
      const { repository, commands } = setup(document())
      expect(await commands.changeStatus(status("d1", { status: "issued" }))).toEqual({ ...document(), status: "issued" })
      expect(repository.changed[0]).toMatchObject({ actorId: "pro-1", audit: { action: "update", summary: "Alterou document" } })
    })

    test.each([
      ["a record of another patient", { id: "cr1", patientId: "p2", status: "finalized" }],
      ["a record that is not finalized", { id: "cr1", patientId: "p1", status: "draft" }],
    ])("refuses to issue a clinical document with %s", async (_name, record) => {
      const { repository, commands } = setup(document())
      repository.clinicalRecords = [record]
      await expect(commands.changeStatus(status("d1", { status: "issued" }))).rejects.toThrow("conflict")
    })

    test("reports a missing clinical record as not found, after the transition check", async () => {
      const missing = setup(document({ clinicalRecordId: "none" }))
      await expect(missing.commands.changeStatus(status("d1", { status: "issued" }))).rejects.toThrow("not_found")
      const unlinked = setup(document({ clinicalRecordId: undefined }))
      await expect(unlinked.commands.changeStatus(status("d1", { status: "issued" }))).rejects.toThrow("not_found")
      const issued = setup(document({ status: "issued", clinicalRecordId: "none" }))
      await expect(issued.commands.changeStatus(status("d1", { status: "issued" }))).rejects.toThrow("conflict")
    })

    test("issues a document that is not clinical without looking at records", async () => {
      const { repository, commands } = setup(document({ classification: "financial", clinicalRecordId: undefined }))
      repository.clinicalRecords = []
      expect(await commands.changeStatus(status("d1", { status: "issued" }))).toMatchObject({ status: "issued" })
    })

    test("only a draft can be issued, and only an issued document archived", async () => {
      const issued = setup(document({ status: "issued" }), document({ id: "d2", status: "archived" }))
      await expect(issued.commands.changeStatus(status("d1", { status: "issued" }))).rejects.toThrow("conflict")
      await expect(issued.commands.changeStatus(status("d2", { status: "issued" }))).rejects.toThrow("conflict")
      const draft = setup(document())
      await expect(draft.commands.changeStatus(status("d1", { status: "archived" }))).rejects.toThrow("conflict")
    })

    test("archiving revokes the active releases and keeps the revoked ones", async () => {
      const revoked = { id: "r0", guardianId: "g0", active: false, revokedAt: "2025-01-01", reason: "motivo" }
      const active = { id: "r1", guardianId: "g1", active: true }
      const { commands } = setup(document({ status: "issued", releases: [revoked, active] }))
      const result = await commands.changeStatus(status("d1", { status: "archived" }))
      expect(result.status).toBe("archived")
      expect(result.releases).toEqual([
        revoked,
        { ...active, active: false, revokedAt: at, revokeReason: "Documento arquivado", revokedBy: "pro-1" },
      ])
    })

    test("archiving a document without releases stores an empty list", async () => {
      const { commands } = setup(document({ status: "issued" }))
      expect((await commands.changeStatus(status("d1", { status: "archived" }))).releases).toEqual([])
    })

    test("legacy: any other status is accepted as sent, and a missing one clears it", async () => {
      const { repository, commands } = setup(document({ status: "issued" }))
      expect(await commands.changeStatus(status("d1", { status: "draft" }))).toMatchObject({ status: "draft" })
      expect(await commands.changeStatus(status("d1", { status: "banana" }))).toMatchObject({ status: "banana" })
      const cleared = await commands.changeStatus(status("d1", {}))
      expect(cleared.status).toBeUndefined()
      expect(repository.changed).toHaveLength(3)
    })

    test("checks access for clinical documents only, and authentication before anything", async () => {
      const { access, commands } = setup(document(), document({ id: "d2", classification: "financial" }))
      access.linkedPatients.clear()
      await expect(commands.changeStatus(status("d1", { status: "issued" }))).rejects.toThrow("forbidden")
      expect(await commands.changeStatus(status("d2", { status: "issued" }))).toMatchObject({ status: "issued" })
      await expect(commands.changeStatus(status("d1", {}, { userId: "system", roles: [] }))).rejects.toThrow("unauthorized")
      await expect(commands.changeStatus(status("missing", {}))).rejects.toThrow("not_found")
    })

    test("a document that is no longer valid cannot change status", async () => {
      const { commands } = setup(document({ title: "" }))
      await expect(commands.changeStatus(status("d1", { status: "issued" }))).rejects.toThrow("validation")
    })
  })

  describe("releases", () => {
    const release = (id: string, body: unknown, actor: Actor = professional) => ({ clinicId, actor, id, body })
    const issued = () => document({ status: "issued", releases: [{ id: "r0", guardianId: "g0", active: true }] })

    test("releases an issued document to a guardian who may receive it", async () => {
      const { repository, commands } = setup(issued())
      const result = await commands.addRelease(release("d1", { guardianId: "g1" }))
      expect(result.releases).toEqual([
        { id: "r0", guardianId: "g0", active: true },
        { guardianId: "g1", id: "rel-new", active: true, createdBy: "pro-1", createdAt: at },
      ])
      expect(repository.guardianChecks).toEqual([{ clinicId, patientId: "p1", guardianId: "g1" }])
    })

    test("starts the release list of a document that has none", async () => {
      const { commands } = setup(document({ status: "issued" }))
      expect((await commands.addRelease(release("d1", { guardianId: "g1" }))).releases).toHaveLength(1)
    })

    test("needs an issued document and a guardian id, before looking the guardian up", async () => {
      const { repository, commands } = setup(document(), issued())
      await expect(commands.addRelease(release("d1", { guardianId: "g1" }))).rejects.toThrow("conflict")
      for (const body of [{}, { guardianId: "" }, { guardianId: 7 }, null]) {
        await expect(commands.addRelease(release("d1", body))).rejects.toThrow("conflict")
      }
      expect(repository.guardianChecks).toEqual([])
    })

    test("forbids a guardian who is unlinked or may not receive documents, even for a repeated release", async () => {
      const { commands } = setup(issued())
      await expect(commands.addRelease(release("d1", { guardianId: "g9" }))).rejects.toThrow("forbidden")
    })

    test("refuses a second active release for the same guardian, but allows one after a revocation", async () => {
      const active = setup(document({ status: "issued", releases: [{ id: "r1", guardianId: "g1", active: true }] }))
      await expect(active.commands.addRelease(release("d1", { guardianId: "g1" }))).rejects.toThrow("conflict")
      const revoked = setup(document({ status: "issued", releases: [{ id: "r1", guardianId: "g1", active: false }] }))
      expect((await revoked.commands.addRelease(release("d1", { guardianId: "g1" }))).releases).toHaveLength(2)
    })

    test("checks access for clinical documents, authentication, and existence", async () => {
      const { access, commands } = setup(issued())
      access.linkedPatients.clear()
      await expect(commands.addRelease(release("d1", { guardianId: "g1" }))).rejects.toThrow("forbidden")
      await expect(commands.addRelease(release("d1", {}, { userId: "", roles: [] }))).rejects.toThrow("unauthorized")
      await expect(commands.addRelease(release("missing", { guardianId: "g1" }, admin))).rejects.toThrow("not_found")
    })
  })

  describe("revoke release", () => {
    const revoke = (id: string, releaseId: string, body: unknown, actor: Actor = professional) =>
      ({ clinicId, actor, id, releaseId, body })
    const withReleases = () =>
      document({
        status: "issued",
        releases: [
          { id: "r1", guardianId: "g1", active: true },
          { id: "r2", guardianId: "g2", active: true },
          { id: "r3", guardianId: "g3", active: false },
        ],
      })

    test("revokes one active release with the reason, leaving the others", async () => {
      const { repository, commands } = setup(withReleases())
      const result = await commands.revokeRelease(revoke("d1", "r2", { reason: "Pedido do responsável" }))
      expect(result.releases).toEqual([
        { id: "r1", guardianId: "g1", active: true },
        { id: "r2", guardianId: "g2", active: false, revokedAt: at, revokedBy: "pro-1", reason: "Pedido do responsável" },
        { id: "r3", guardianId: "g3", active: false },
      ])
      expect(repository.changed[0]).toMatchObject({ audit: { action: "update", summary: "Alterou document" } })
    })

    test("needs a reason of at least five characters once trimmed", async () => {
      const { repository, commands } = setup(withReleases())
      for (const body of [{}, { reason: "  abcd  " }, { reason: "curt" }, null]) {
        await expect(commands.revokeRelease(revoke("d1", "r1", body))).rejects.toThrow("validation")
      }
      expect(repository.changed).toEqual([])
      expect(await commands.revokeRelease(revoke("d1", "r1", { reason: " abcde " }))).toMatchObject({ id: "d1" })
    })

    test("reports an unknown document before the reason, and an unmatched release after it", async () => {
      const allActive = document({ id: "d2", status: "issued", releases: [{ id: "r1", guardianId: "g1", active: true }] })
      const { commands } = setup(withReleases(), allActive, document({ id: "d3", status: "issued" }))
      await expect(commands.revokeRelease(revoke("missing", "r1", {}))).rejects.toThrow("not_found")
      await expect(commands.revokeRelease(revoke("d2", "none", { reason: "Pedido do responsável" }))).rejects.toThrow("not_found")
      await expect(commands.revokeRelease(revoke("d3", "r1", { reason: "Pedido do responsável" }))).rejects.toThrow("not_found")
      await expect(commands.revokeRelease(revoke("d2", "none", { reason: "x" }))).rejects.toThrow("validation")
    })

    test("legacy: an unknown or already revoked release is only noticed while every release is active", async () => {
      const { repository, commands } = setup(withReleases())
      for (const releaseId of ["none", "r3"]) {
        const result = await commands.revokeRelease(revoke("d1", releaseId, { reason: "Pedido do responsável" }))
        expect(result.releases).toEqual(withReleases().releases)
      }
      expect(repository.changed).toHaveLength(2)
    })

    test("checks access for a clinical document, and authentication", async () => {
      const { repository, access, commands } = setup(withReleases())
      access.linkedPatients.clear()
      await expect(commands.revokeRelease(revoke("d1", "r1", { reason: "Pedido do responsável" }))).rejects.toThrow("forbidden")
      for (const actor of [{ userId: "system", roles: [] }, { userId: "", roles: [] }]) {
        await expect(commands.revokeRelease(revoke("d1", "r1", { reason: "Pedido do responsável" }, actor)))
          .rejects.toThrow("unauthorized")
      }
      expect(repository.changed).toEqual([])
      expect(access.checked).toEqual([{ patientId: "p1", actor: professional }])
    })

    test("a document that is not clinical is revoked without a patient access check", async () => {
      const { access, commands } = setup({ ...withReleases(), classification: "financial", clinicalRecordId: undefined })
      access.linkedPatients.clear()
      expect(await commands.revokeRelease(revoke("d1", "r1", { reason: "Pedido do responsável" }))).toMatchObject({ id: "d1" })
      expect(access.checked).toEqual([])
    })

    test("a document that is no longer valid cannot take the revocation", async () => {
      const { commands } = setup(document({ title: "", releases: [{ id: "r1", active: true }] }))
      await expect(commands.revokeRelease(revoke("d1", "r1", { reason: "Pedido do responsável" }))).rejects.toThrow("validation")
    })
  })
})
