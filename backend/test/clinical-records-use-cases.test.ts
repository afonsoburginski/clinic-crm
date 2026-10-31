import { describe, expect, test } from "bun:test"
import type { ClinicalRecord } from "@/application/ports/clinical-records"
import type { Actor } from "@/application/ports/patient-access"
import {
  createClinicalRecordCommands,
  createClinicalRecordQueries,
  versionChain,
} from "@/application/use-cases/clinical-records"
import { FakeClinicalRecordRepository } from "./fakes/clinical-records-repository"
import { FakePatientAccess } from "./fakes/patient-access"

const clinicId = "clinic"
const admin: Actor = { userId: "admin-1", roles: ["admin"] }
const author: Actor = { userId: "pro-1", roles: ["professional"], professionalId: "pr1" }
const content = "Paciente evoluiu bem durante a sessão."

function record(fields: Partial<ClinicalRecord> & { id: string }): ClinicalRecord {
  return { patientId: "p1", type: "progress", status: "draft", ...fields }
}

function setup(...records: ClinicalRecord[]) {
  const repository = new FakeClinicalRecordRepository()
  repository.records = records
  const access = new FakePatientAccess()
  access.linkedPatients.add("p1")
  return {
    repository,
    access,
    queries: createClinicalRecordQueries(repository, access),
    commands: createClinicalRecordCommands(repository, access),
  }
}

describe("versionChain", () => {
  const v1 = record({ id: "v1", status: "superseded", version: 1 })
  const v2 = record({ id: "v2", parentId: "v1", version: 2 })
  const v2b = record({ id: "v2b", parentId: "v1", version: 3 })
  const v3 = record({ id: "v3", parentId: "v2", version: 3 })
  const unrelated = record({ id: "other", version: 1 })

  test("starts at the root and walks rectifications depth-first by version", () => {
    const all = [v3, v2b, unrelated, v2, v1]
    expect(versionChain(v1, all).map((r) => r.id)).toEqual(["v1", "v2", "v3", "v2b"])
  })

  test("resolves the same chain from every version", () => {
    const all = [v1, v2, v3, v2b, unrelated]
    expect(versionChain(v3, all).map((r) => r.id)).toEqual(["v1", "v2", "v3", "v2b"])
    expect(versionChain(unrelated, all).map((r) => r.id)).toEqual(["other"])
  })

  test("treats a record whose parent is not visible as the root", () => {
    expect(versionChain(v2, [v2, v3]).map((r) => r.id)).toEqual(["v2", "v3"])
  })

  test("orders siblings with a missing version first", () => {
    const noVersion = record({ id: "n", parentId: "v1" })
    expect(versionChain(v1, [v1, v2, noVersion]).map((r) => r.id)).toEqual(["v1", "n", "v2"])
  })

  test("terminates on cyclic data and lists each stored record once", () => {
    const a = record({ id: "a", parentId: "b" })
    const b = record({ id: "b", parentId: "a" })
    expect(versionChain(a, [a, b]).map((r) => r.id)).toEqual(["b", "a"])
    const selfParent = record({ id: "s", parentId: "s" })
    expect(versionChain(selfParent, [selfParent])).toEqual([selfParent])
  })
})

describe("clinical record queries", () => {
  test("scopes the list to the professional's own patients", async () => {
    const { repository, queries } = setup(record({ id: "r1" }))
    const filters = { patientId: "p1", status: "draft", from: "2025-01-01", to: "2025-02-01" }
    expect(await queries.listRecords({ clinicId, actor: author, filters })).toEqual(repository.records)
    expect(repository.found[0]).toEqual({ clinicId, filters, professionalId: "pr1" })
  })

  test("does not scope the list for other roles, even when linked to a professional", async () => {
    const { repository, queries } = setup()
    await queries.listRecords({ clinicId, actor: { ...admin, professionalId: "pr9" }, filters: {} })
    expect(repository.found[0]).toEqual({ clinicId, filters: {}, professionalId: undefined })
  })

  test("never lists without a scope for a professional lacking a professional link", async () => {
    const unlinked: Actor = { userId: "pro-2", roles: ["professional"] }
    const { repository, queries } = setup(record({ id: "r1" }))
    await expect(queries.listRecords({ clinicId, actor: unlinked, filters: {} })).rejects.toThrow("forbidden")
    await expect(queries.listRecords({ clinicId, actor: { ...unlinked, professionalId: "" }, filters: {} }))
      .rejects.toThrow("forbidden")
    await expect(queries.listClinicalPatients({ clinicId, actor: unlinked })).rejects.toThrow("forbidden")
    await expect(queries.listVersions({ clinicId, actor: unlinked, id: "r1" })).rejects.toThrow("forbidden")
    expect(repository.found).toEqual([])
  })

  test("lists clinical patients for the actor's professional link", async () => {
    const { repository, queries } = setup()
    await queries.listClinicalPatients({ clinicId, actor: { ...admin, professionalId: "pr9" } })
    expect(repository.found[0]).toEqual({ clinicId, filters: {}, professionalId: "pr9" })
  })

  test("gets a record after checking access to its patient", async () => {
    const { access, queries } = setup(record({ id: "r1" }), record({ id: "r2", patientId: "p2" }))
    expect(await queries.getRecord({ clinicId, actor: author, id: "r1" })).toEqual(record({ id: "r1" }))
    expect(access.checked).toEqual([{ patientId: "p1", actor: author }])
    await expect(queries.getRecord({ clinicId, actor: author, id: "r2" })).rejects.toThrow("forbidden")
    await expect(queries.getRecord({ clinicId, actor: author, id: "missing" })).rejects.toThrow("not_found")
  })

  test("lists the version chain scoped by the actor's professional", async () => {
    const v1 = record({ id: "v1", status: "superseded", version: 1 })
    const v2 = record({ id: "v2", parentId: "v1", version: 2 })
    const { repository, queries } = setup(v2, v1)
    expect((await queries.listVersions({ clinicId, actor: author, id: "v2" })).map((r) => r.id)).toEqual(["v1", "v2"])
    expect(repository.found[0]).toEqual({ clinicId, filters: {}, professionalId: "pr1" })
    await expect(queries.listVersions({ clinicId, actor: author, id: "missing" })).rejects.toThrow("not_found")
  })

  test("does not list versions of a patient the professional is not linked to", async () => {
    const { repository, queries } = setup(record({ id: "r1", patientId: "p2" }))
    await expect(queries.listVersions({ clinicId, actor: author, id: "r1" })).rejects.toThrow("forbidden")
    expect(repository.found).toEqual([])
  })
})

describe("clinical record commands", () => {
  test("creates a draft authored by the actor and audits the creation", async () => {
    const { repository, commands } = setup()
    const created = await commands.createRecord({
      clinicId, actor: author, body: { patientId: "p1", type: "anamnesis", title: "Primeira consulta" },
    })
    expect(created).toEqual({
      id: "new", patientId: "p1", type: "anamnesis", title: "Primeira consulta", createdBy: "pro-1", status: "draft",
    })
    expect(repository.inserted[0]).toMatchObject({
      clinicId, actorId: "pro-1", audit: { action: "create", summary: "Alterou clinical-record" },
    })
  })

  test("checks patient access before validating the body", async () => {
    const { commands } = setup()
    await expect(commands.createRecord({ clinicId, actor: author, body: { type: "progress" } })).rejects.toThrow("forbidden")
    await expect(commands.createRecord({ clinicId, actor: author, body: { patientId: "p2", type: "progress" } }))
      .rejects.toThrow("forbidden")
  })

  test.each([
    ["a non-object body", "text"],
    ["a missing patient", { type: "progress" }],
    ["an unknown type", { patientId: "p1", type: "evolution" }],
    ["a missing type", { patientId: "p1" }],
  ])("rejects %s with a validation error", async (_label, body) => {
    const { repository, commands } = setup()
    await expect(commands.createRecord({ clinicId, actor: admin, body })).rejects.toThrow("validation")
    expect(repository.inserted).toEqual([])
  })

  test.each(["finalized", "superseded", "anything"])(
    "creates a draft whatever status (%s) the client sends, without superseding a parent",
    async (status) => {
      const { repository, commands } = setup()
      const created = await commands.createRecord({
        clinicId, actor: admin, body: { patientId: "p1", type: "progress", status, parentId: "v1" },
      })
      expect(created.status).toBe("draft")
      expect(repository.inserted[0].payload.status).toBe("draft")
      expect(repository.inserted[0]).not.toHaveProperty("supersedesId")
    },
  )

  test("ignores the fields only the actions manage, and a stray id, on create", async () => {
    const { repository, commands } = setup()
    const created = await commands.createRecord({
      clinicId,
      actor: author,
      body: {
        id: "victim", patientId: "p1", type: "progress", title: "Sessão", status: "finalized", createdBy: "someone-else",
        parentId: "v1", version: 9, rectificationReason: "forjado",
      },
    })
    expect(created).toEqual({
      id: "new", patientId: "p1", type: "progress", title: "Sessão", createdBy: "pro-1", status: "draft",
    })
  })

  describe("update", () => {
    test("patches a draft and returns the merged record", async () => {
      const { repository, access, commands } = setup(record({ id: "r1", title: "Antigo" }))
      const updated = await commands.updateRecord({
        clinicId, actor: author, id: "r1", body: { patientId: "p1", type: "progress", title: "Novo" },
      })
      expect(updated).toMatchObject({ id: "r1", title: "Novo", status: "draft" })
      expect(repository.patched[0]).toMatchObject({
        clinicId, id: "r1", actorId: "pro-1", expectedStatus: "draft", supersedesId: undefined,
        patch: { patientId: "p1", type: "progress", title: "Novo" },
        audit: { action: "update", summary: "Alterou clinical-record" },
      })
      expect(access.checked[0].patientId).toBe("p1")
    })

    test("reports a missing record before anything else", async () => {
      const { commands } = setup()
      await expect(commands.updateRecord({ clinicId, actor: author, id: "missing", body: "text" })).rejects.toThrow("not_found")
    })

    test("checks access to the stored patient, then validates the body", async () => {
      const { repository, commands } = setup(record({ id: "r1", patientId: "p2" }), record({ id: "r2" }))
      await expect(commands.updateRecord({ clinicId, actor: author, id: "r1", body: { patientId: "p1", type: "progress" } }))
        .rejects.toThrow("forbidden")
      await expect(commands.updateRecord({ clinicId, actor: author, id: "r2", body: "text" })).rejects.toThrow("validation")
      expect(repository.patched).toEqual([])
    })

    test("does not require patientId or type, only validates the fields present", async () => {
      const { repository, commands } = setup(record({ id: "r1", title: "Antigo" }))
      const updated = await commands.updateRecord({ clinicId, actor: author, id: "r1", body: { title: "Novo" } })
      expect(updated).toMatchObject({ id: "r1", patientId: "p1", type: "progress", title: "Novo" })
      expect(repository.patched[0].patch).toEqual({ title: "Novo" })
    })

    test.each([
      ["an empty patientId", { patientId: "" }],
      ["a non-string patientId", { patientId: 7 }],
      ["an unknown type", { type: "evolution" }],
      ["a null type", { type: null }],
    ])("rejects %s when it is present", async (_label, body) => {
      const { repository, commands } = setup(record({ id: "r1" }))
      await expect(commands.updateRecord({ clinicId, actor: admin, id: "r1", body })).rejects.toThrow("validation")
      expect(repository.patched).toEqual([])
    })

    test("checks access to a new patientId too, not only the stored one", async () => {
      const { repository, access, commands } = setup(record({ id: "r1" }))
      await expect(commands.updateRecord({ clinicId, actor: author, id: "r1", body: { patientId: "p2" } }))
        .rejects.toThrow("forbidden")
      expect(repository.patched).toEqual([])
      expect(access.checked.map((entry) => entry.patientId)).toEqual(["p1", "p2"])
      access.linkedPatients.add("p2")
      await commands.updateRecord({ clinicId, actor: author, id: "r1", body: { patientId: "p2" } })
      expect(repository.patched[0].patch).toEqual({ patientId: "p2" })
    })

    test("does not check the patient twice when it is unchanged", async () => {
      const { access, commands } = setup(record({ id: "r1" }))
      await commands.updateRecord({ clinicId, actor: author, id: "r1", body: { patientId: "p1", title: "Novo" } })
      expect(access.checked).toHaveLength(1)
    })

    test.each([
      ["status finalized", { status: "finalized" }],
      ["status draft", { status: "draft" }],
      ["status null", { status: null }],
      ["status superseded", { status: "superseded" }],
      ["createdBy", { createdBy: "pro-1" }],
      ["parentId", { parentId: "victim" }],
      ["version", { version: 5 }],
      ["rectificationReason", { rectificationReason: "forjado" }],
    ])("rejects %s: only finalize and rectify manage it", async (_label, extra) => {
      const { repository, commands } = setup(record({ id: "r1", title: "T", content, createdBy: "someone-else" }))
      await expect(commands.updateRecord({ clinicId, actor: author, id: "r1", body: { title: "Novo", ...extra } }))
        .rejects.toThrow("validation")
      expect(repository.patched).toEqual([])
    })

    test("drops a stray id from the patch", async () => {
      const { repository, commands } = setup(record({ id: "r1" }))
      const updated = await commands.updateRecord({ clinicId, actor: author, id: "r1", body: { id: "victim", title: "Novo" } })
      expect(repository.patched[0].patch).toEqual({ title: "Novo" })
      expect(updated.id).toBe("r1")
    })

    test("refuses to edit a record that is no longer a draft", async () => {
      const { repository, commands } = setup(record({ id: "r1", status: "finalized" }))
      await expect(commands.updateRecord({ clinicId, actor: admin, id: "r1", body: { patientId: "p1", type: "progress" } }))
        .rejects.toThrow("conflict")
      expect(repository.patched).toEqual([])
    })

    test("cannot finalize through an update: a non-author is stopped by finalize, not bypassed by PATCH", async () => {
      const { repository, commands } = setup(record({ id: "r1", title: "T", content, createdBy: "someone-else" }))
      const body = { status: "finalized" }
      await expect(commands.updateRecord({ clinicId, actor: author, id: "r1", body })).rejects.toThrow("validation")
      await expect(commands.updateRecord({ clinicId, actor: author, id: "r1", body: { createdBy: "pro-1" } }))
        .rejects.toThrow("validation")
      await expect(commands.finalizeRecord({ clinicId, actor: author, id: "r1" })).rejects.toThrow("forbidden")
      expect(repository.patched).toEqual([])
    })

    test("maps a lost race on the draft status to a conflict", async () => {
      const { repository, commands } = setup(record({ id: "r1" }))
      repository.patch = async () => ({ outcome: "conflict" })
      await expect(commands.updateRecord({ clinicId, actor: admin, id: "r1", body: { patientId: "p1", type: "progress" } }))
        .rejects.toThrow("conflict")
      repository.patch = async () => ({ outcome: "not_found" })
      await expect(commands.updateRecord({ clinicId, actor: admin, id: "r1", body: { patientId: "p1", type: "progress" } }))
        .rejects.toThrow("not_found")
    })
  })

  describe("finalize", () => {
    const draft = record({ id: "r1", title: "Sessão", content, createdBy: "pro-1" })

    test("finalizes the author's draft", async () => {
      const { repository, commands } = setup(draft)
      const finalized = await commands.finalizeRecord({ clinicId, actor: author, id: "r1" })
      expect(finalized).toMatchObject({ id: "r1", status: "finalized" })
      expect(repository.patched[0]).toMatchObject({
        id: "r1", actorId: "pro-1", patch: { status: "finalized" }, expectedStatus: "draft", supersedesId: undefined,
      })
    })

    test("supersedes the parent when finalizing a rectification", async () => {
      const { repository, commands } = setup({ ...draft, parentId: "v0", version: 2 })
      await commands.finalizeRecord({ clinicId, actor: author, id: "r1" })
      expect(repository.patched[0].supersedesId).toBe("v0")
    })

    test.each([["empty", ""], ["system", "system"]])("rejects a %s caller", async (_label, userId) => {
      const { repository, commands } = setup(draft)
      await expect(commands.finalizeRecord({ clinicId, actor: { ...author, userId }, id: "r1" })).rejects.toThrow("unauthorized")
      expect(repository.patched).toEqual([])
    })

    test("only the author can finalize", async () => {
      const { repository, commands } = setup(draft)
      await expect(commands.finalizeRecord({ clinicId, actor: { ...admin, userId: "someone-else" }, id: "r1" }))
        .rejects.toThrow("forbidden")
      expect(repository.patched).toEqual([])
    })

    test("checks access to the patient first", async () => {
      const { commands } = setup({ ...draft, patientId: "p2" })
      await expect(commands.finalizeRecord({ clinicId, actor: author, id: "r1" })).rejects.toThrow("forbidden")
      await expect(commands.finalizeRecord({ clinicId, actor: author, id: "missing" })).rejects.toThrow("not_found")
    })

    test("requires a title and at least 20 characters of content", async () => {
      const { commands } = setup(
        { ...draft, title: "" },
        record({ id: "r2", title: "T", content: "curto", createdBy: "pro-1" }),
      )
      await expect(commands.finalizeRecord({ clinicId, actor: author, id: "r1" })).rejects.toThrow("validation")
      await expect(commands.finalizeRecord({ clinicId, actor: author, id: "r2" })).rejects.toThrow("validation")
    })

    test("cannot finalize twice", async () => {
      const { commands } = setup({ ...draft, status: "finalized" })
      await expect(commands.finalizeRecord({ clinicId, actor: author, id: "r1" })).rejects.toThrow("conflict")
    })
  })

  describe("rectify", () => {
    const finalized = record({ id: "r1", title: "Sessão", content, status: "finalized", createdBy: "pro-1", version: 2 })
    const reason = "Corrigir a data da sessão"

    test("opens the next draft version of a finalized record", async () => {
      const { repository, commands } = setup(finalized)
      await commands.rectifyRecord({ clinicId, actor: admin, id: "r1", body: { reason } })
      expect(repository.inserted[0]).toMatchObject({
        clinicId,
        actorId: "admin-1",
        audit: { action: "create", summary: "Alterou clinical-record" },
        payload: {
          patientId: "p1", type: "progress", title: "Sessão", content,
          status: "draft", parentId: "r1", rectificationReason: reason, version: 3, createdBy: "pro-1",
        },
      })
    })

    test("does not copy the parent's id into the new draft, so the new row id is what reads back", async () => {
      const { repository, commands } = setup(finalized)
      const draft = await commands.rectifyRecord({ clinicId, actor: admin, id: "r1", body: { reason } })
      expect(repository.inserted[0].payload).not.toHaveProperty("id")
      expect(draft.id).toBe("new")
    })

    test("starts at version 2 when the original has no version", async () => {
      const { repository, commands } = setup({ ...finalized, version: undefined })
      await commands.rectifyRecord({ clinicId, actor: admin, id: "r1", body: { reason } })
      expect(repository.inserted[0].payload.version).toBe(2)
    })

    test("only finalized records can be rectified", async () => {
      const { repository, commands } = setup({ ...finalized, status: "draft" })
      await expect(commands.rectifyRecord({ clinicId, actor: admin, id: "r1", body: { reason } })).rejects.toThrow("validation")
      expect(repository.inserted).toEqual([])
    })

    test.each([["a short reason", { reason: "curto" }], ["no reason", {}], ["a non-object body", "text"]])(
      "rejects %s",
      async (_label, body) => {
        const { repository, commands } = setup(finalized)
        await expect(commands.rectifyRecord({ clinicId, actor: admin, id: "r1", body })).rejects.toThrow("validation")
        expect(repository.inserted).toEqual([])
      },
    )

    test("checks access, existence and the caller", async () => {
      const { commands } = setup({ ...finalized, patientId: "p2" })
      await expect(commands.rectifyRecord({ clinicId, actor: author, id: "r1", body: { reason } })).rejects.toThrow("forbidden")
      await expect(commands.rectifyRecord({ clinicId, actor: author, id: "missing", body: { reason } })).rejects.toThrow("not_found")
      await expect(commands.rectifyRecord({ clinicId, actor: { ...author, userId: "" }, id: "r1", body: { reason } }))
        .rejects.toThrow("unauthorized")
    })
  })
})
