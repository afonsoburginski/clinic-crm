import { describe, expect, test } from "bun:test"
import type { Assessment } from "@/application/ports/assessments"
import type { Actor } from "@/application/ports/patient-access"
import {
  createAssessmentCommands,
  createAssessmentQueries,
  type AssessmentRuntime,
} from "@/application/use-cases/assessments"
import { FakeAssessmentRepository } from "./fakes/assessments-repository"
import { FakePatientAccess } from "./fakes/patient-access"

const clinicId = "clinic"
const admin: Actor = { userId: "admin-1", roles: ["admin"] }
const professional: Actor = { userId: "pro-1", roles: ["professional"], professionalId: "pr1" }
const at = "2025-03-01T12:00:00.000Z"
const runtime: AssessmentRuntime = { now: () => new Date(at), newId: () => "interp-1" }
const interpretation = "Resultados compatíveis com o perfil esperado."

function assessment(fields: Partial<Assessment> = {}): Assessment {
  return {
    id: "a1",
    patientId: "p1",
    status: "in_progress",
    stages: [{ id: "s1", status: "pending" }, { id: "s2", status: "completed" }],
    ...fields,
  }
}

function setup(...records: Assessment[]) {
  const repository = new FakeAssessmentRepository()
  repository.records = records
  const access = new FakePatientAccess()
  access.linkedPatients.add("p1")
  return {
    repository,
    access,
    queries: createAssessmentQueries(repository, access),
    commands: createAssessmentCommands(repository, access, runtime),
  }
}

describe("assessment queries", () => {
  test("scopes the list to the professional's own patients", async () => {
    const { repository, queries } = setup(assessment())
    const filters = { patientId: "p1", status: "in_progress", from: "2025-01-01", to: "2025-02-01" }
    expect(await queries.listAssessments({ clinicId, actor: professional, filters })).toEqual(repository.records)
    expect(repository.found[0]).toEqual({ clinicId, filters, professionalId: "pr1" })
  })

  test("does not scope the list for other roles", async () => {
    const { repository, queries } = setup()
    await queries.listAssessments({ clinicId, actor: { ...admin, professionalId: "pr9" }, filters: {} })
    expect(repository.found[0].professionalId).toBeUndefined()
  })

  test("never lists without a scope for a professional lacking a professional link", async () => {
    const { repository, queries } = setup(assessment())
    const unlinked: Actor = { userId: "pro-2", roles: ["professional"] }
    await expect(queries.listAssessments({ clinicId, actor: unlinked, filters: {} })).rejects.toThrow("forbidden")
    await expect(queries.listAssessments({ clinicId, actor: { ...unlinked, professionalId: "" }, filters: {} }))
      .rejects.toThrow("forbidden")
    expect(repository.found).toEqual([])
  })

  test("gets an assessment after checking access to its patient", async () => {
    const { access, queries } = setup(assessment(), assessment({ id: "a2", patientId: "p2" }))
    expect(await queries.getAssessment({ clinicId, actor: professional, id: "a1" })).toEqual(assessment())
    expect(access.checked).toEqual([{ patientId: "p1", actor: professional }])
    await expect(queries.getAssessment({ clinicId, actor: professional, id: "a2" })).rejects.toThrow("forbidden")
    await expect(queries.getAssessment({ clinicId, actor: professional, id: "missing" })).rejects.toThrow("not_found")
  })
})

describe("assessment commands", () => {
  describe("create and update", () => {
    test("creates a pending assessment authored by the actor and audits the creation", async () => {
      const { repository, commands } = setup()
      const created = await commands.createAssessment({ clinicId, actor: professional, body: { patientId: "p1", name: "WISC" } })
      expect(created).toEqual({ id: "new", patientId: "p1", name: "WISC", createdBy: "pro-1", status: "pending" })
      expect(repository.inserted[0]).toMatchObject({
        clinicId, actorId: "pro-1", audit: { action: "create", summary: "Alterou assessment" },
      })
    })

    test("allows the client to start in_progress, but never completed or cancelled", async () => {
      const { repository, commands } = setup()
      const started = await commands.createAssessment({ clinicId, actor: admin, body: { patientId: "p1", status: "in_progress" } })
      expect(started.status).toBe("in_progress")
      expect(repository.inserted[0].payload.status).toBe("in_progress")
    })

    test.each(["completed", "cancelled", "anything"])(
      "falls back to pending when the client sends %s",
      async (status) => {
        const { repository, commands } = setup()
        const created = await commands.createAssessment({ clinicId, actor: admin, body: { patientId: "p1", status } })
        expect(created.status).toBe("pending")
        expect(repository.inserted[0].payload.status).toBe("pending")
      },
    )

    test("ignores a stray id on create", async () => {
      const { repository, commands } = setup()
      const created = await commands.createAssessment({ clinicId, actor: admin, body: { id: "victim", patientId: "p1" } })
      expect(repository.inserted[0].payload).not.toHaveProperty("id")
      expect(created.id).toBe("new")
    })

    test("checks patient access before validating the body", async () => {
      const { commands } = setup()
      await expect(commands.createAssessment({ clinicId, actor: professional, body: {} })).rejects.toThrow("forbidden")
      await expect(commands.createAssessment({ clinicId, actor: professional, body: { patientId: "p2" } }))
        .rejects.toThrow("forbidden")
    })

    test.each([["a non-object body", "text"], ["a missing patient", { name: "WISC" }]])(
      "rejects %s with a validation error",
      async (_label, body) => {
        const { repository, commands } = setup()
        await expect(commands.createAssessment({ clinicId, actor: admin, body })).rejects.toThrow("validation")
        expect(repository.inserted).toEqual([])
      },
    )

    test("patches an assessment with the validated body", async () => {
      const { repository, commands } = setup(assessment())
      const updated = await commands.updateAssessment({
        clinicId, actor: professional, id: "a1", body: { patientId: "p1", name: "Novo" },
      })
      expect(updated).toMatchObject({ id: "a1", name: "Novo", status: "in_progress" })
      expect(repository.patched[0]).toMatchObject({
        clinicId, id: "a1", actorId: "pro-1", patch: { patientId: "p1", name: "Novo" },
        blockedStatuses: ["completed", "cancelled"], audit: { action: "update", summary: "Alterou assessment" },
      })
      expect(repository.patched[0].expectedStatus).toBeUndefined()
    })

    test.each(["draft", "pending", "in_progress"])("allows editing an assessment that is %s", async (status) => {
      const { commands } = setup(assessment({ status }))
      await expect(commands.updateAssessment({ clinicId, actor: admin, id: "a1", body: { patientId: "p1", name: "Novo" } }))
        .resolves.toMatchObject({ name: "Novo" })
    })

    test.each(["completed", "cancelled"])("refuses to edit stages or interpretations of a %s assessment", async (status) => {
      const { repository, commands } = setup(assessment({ status, interpretations: [{ id: "i1" }] }))
      const body = { patientId: "p1", stages: [{ id: "s1", status: "pending" }], interpretations: [] }
      await expect(commands.updateAssessment({ clinicId, actor: admin, id: "a1", body })).rejects.toThrow("conflict")
      expect(repository.patched).toEqual([])
    })

    test("a status that closes the assessment between the read and the write is a conflict", async () => {
      const { repository, commands } = setup(assessment())
      const original = repository.findById.bind(repository)
      repository.findById = async (clinicId, id) => {
        const found = await original(clinicId, id)
        repository.records = [assessment({ status: "completed" })]
        return found
      }
      await expect(commands.updateAssessment({ clinicId, actor: admin, id: "a1", body: { patientId: "p1", name: "Novo" } }))
        .rejects.toThrow("conflict")
    })

    test("checks access to a new patientId too, not only the stored one", async () => {
      const { repository, access, commands } = setup(assessment())
      await expect(commands.updateAssessment({ clinicId, actor: professional, id: "a1", body: { patientId: "p2" } }))
        .rejects.toThrow("forbidden")
      expect(repository.patched).toEqual([])
      expect(access.checked.map((entry) => entry.patientId)).toEqual(["p1", "p2"])
      access.linkedPatients.add("p2")
      await commands.updateAssessment({ clinicId, actor: professional, id: "a1", body: { patientId: "p2" } })
      expect(repository.patched[0].patch).toEqual({ patientId: "p2" })
    })

    test("does not check the patient twice when it is unchanged, and drops a stray id", async () => {
      const { repository, access, commands } = setup(assessment())
      const updated = await commands.updateAssessment({
        clinicId, actor: professional, id: "a1", body: { id: "victim", patientId: "p1", name: "Novo" },
      })
      expect(access.checked).toHaveLength(1)
      expect(repository.patched[0].patch).toEqual({ patientId: "p1", name: "Novo" })
      expect(updated.id).toBe("a1")
    })

    test("checks existence, then access to the stored patient, then the body", async () => {
      const { repository, commands } = setup(assessment({ patientId: "p2" }), assessment({ id: "a2" }))
      await expect(commands.updateAssessment({ clinicId, actor: professional, id: "missing", body: {} })).rejects.toThrow("not_found")
      await expect(commands.updateAssessment({ clinicId, actor: professional, id: "a1", body: { patientId: "p1" } }))
        .rejects.toThrow("forbidden")
      await expect(commands.updateAssessment({ clinicId, actor: professional, id: "a2", body: { name: "x" } }))
        .rejects.toThrow("validation")
      expect(repository.patched).toEqual([])
    })

    test("rejects a status field in the generic update: only the dedicated actions move status", async () => {
      const { repository, commands } = setup(assessment())
      await expect(commands.updateAssessment({
        clinicId, actor: professional, id: "a1", body: { patientId: "p1", status: "completed" },
      })).rejects.toThrow("validation")
      expect(repository.patched).toEqual([])
    })
  })

  describe("actions", () => {
    test.each([["empty", ""], ["system", "system"]])("reject a %s caller", async (_label, userId) => {
      const { repository, commands } = setup(assessment())
      const actor = { ...professional, userId }
      await expect(commands.complete({ clinicId, actor, id: "a1" })).rejects.toThrow("unauthorized")
      await expect(commands.cancel({ clinicId, actor, id: "a1", body: { reason: "motivo válido" } })).rejects.toThrow("unauthorized")
      expect(repository.patched).toEqual([])
    })

    test("check existence and patient access first", async () => {
      const { commands } = setup(assessment({ patientId: "p2" }))
      await expect(commands.complete({ clinicId, actor: professional, id: "missing" })).rejects.toThrow("not_found")
      await expect(commands.complete({ clinicId, actor: professional, id: "a1" })).rejects.toThrow("forbidden")
    })

    test.each(["draft", "completed", "cancelled"])("only run on in-progress assessments (not %s)", async (status) => {
      const { repository, commands } = setup(assessment({ status }))
      await expect(commands.cancel({ clinicId, actor: admin, id: "a1", body: { reason: "motivo válido" } })).rejects.toThrow("conflict")
      expect(repository.patched).toEqual([])
    })

    test("map a lost race on the in-progress status to a conflict", async () => {
      const { repository, commands } = setup(assessment({ stages: [] }))
      repository.patch = async () => ({ outcome: "conflict" })
      await expect(commands.cancel({ clinicId, actor: admin, id: "a1", body: { reason: "motivo válido" } })).rejects.toThrow("conflict")
      repository.patch = async () => ({ outcome: "not_found" })
      await expect(commands.cancel({ clinicId, actor: admin, id: "a1", body: { reason: "motivo válido" } })).rejects.toThrow("not_found")
    })

    describe("stages", () => {
      test("advances a stage and records the event", async () => {
        const { repository, commands } = setup(assessment({ events: [{ action: "earlier" }] }))
        const result = await commands.advanceStage({
          clinicId, actor: professional, id: "a1", body: { stageId: "s1", status: "in_progress" },
        })
        expect(result.stages).toEqual([
          { id: "s1", status: "in_progress", updatedBy: "pro-1" },
          { id: "s2", status: "completed" },
        ])
        expect(result.events).toEqual([{ action: "earlier" }, { action: "stages", actor: "pro-1", at }])
        expect(repository.patched[0]).toMatchObject({
          id: "a1", actorId: "pro-1", expectedStatus: "in_progress", audit: { action: "update", summary: "Alterou assessment" },
        })
      })

      test.each([
        ["pending", "in_progress", true],
        ["pending", "completed", false],
        ["in_progress", "pending", true],
        ["in_progress", "completed", true],
        ["completed", "in_progress", false],
        ["completed", "pending", false],
        ["pending", "pending", false],
        ["pending", "bogus", false],
        ["bogus", "pending", false],
      ])("stage %s → %s is allowed: %p", async (from, to, allowed) => {
        const { commands } = setup(assessment({ stages: [{ id: "s1", status: from }] }))
        const run = commands.advanceStage({ clinicId, actor: admin, id: "a1", body: { stageId: "s1", status: to } })
        if (allowed) await expect(run).resolves.toBeDefined()
        else await expect(run).rejects.toThrow("conflict")
      })

      test("rejects an unknown stage and a missing target status", async () => {
        const { repository, commands } = setup(assessment())
        await expect(commands.advanceStage({ clinicId, actor: admin, id: "a1", body: { stageId: "nope", status: "in_progress" } }))
          .rejects.toThrow("not_found")
        await expect(commands.advanceStage({ clinicId, actor: admin, id: "a1", body: { stageId: "s1" } })).rejects.toThrow("conflict")
        await expect(commands.advanceStage({ clinicId, actor: admin, id: "a1", body: "text" })).rejects.toThrow("not_found")
        expect(repository.patched).toEqual([])
      })
    })

    describe("interpretations", () => {
      test("appends a versioned interpretation and records the event", async () => {
        const { commands } = setup(assessment({ interpretations: [{ id: "old", version: 1 }] }))
        const result = await commands.addInterpretation({ clinicId, actor: professional, id: "a1", body: { content: interpretation } })
        expect(result.interpretations).toEqual([
          { id: "old", version: 1 },
          { id: "interp-1", version: 2, content: interpretation, createdBy: "pro-1", at },
        ])
        expect(result.events).toEqual([{ action: "interpretations", actor: "pro-1", at }])
      })

      test.each([["short", { content: "curto demais" }], ["missing", {}], ["blank", { content: " ".repeat(30) }]])(
        "rejects %s content",
        async (_label, body) => {
          const { repository, commands } = setup(assessment())
          await expect(commands.addInterpretation({ clinicId, actor: admin, id: "a1", body })).rejects.toThrow("validation")
          expect(repository.patched).toEqual([])
        },
      )
    })

    describe("complete", () => {
      const ready = assessment({
        stages: [{ id: "s1", status: "completed" }],
        interpretations: [{ id: "i1", version: 1 }],
      })

      test("completes when every stage is done and an interpretation exists", async () => {
        const { repository, commands } = setup(ready)
        const result = await commands.complete({ clinicId, actor: professional, id: "a1" })
        expect(result).toMatchObject({ status: "completed", events: [{ action: "complete", actor: "pro-1", at }] })
        expect(repository.patched[0]).toMatchObject({ patch: { status: "completed" }, expectedStatus: "in_progress" })
      })

      test("needs every stage completed", async () => {
        const { commands } = setup({ ...ready, stages: [{ id: "s1", status: "completed" }, { id: "s2", status: "pending" }] })
        await expect(commands.complete({ clinicId, actor: admin, id: "a1" })).rejects.toThrow("conflict")
      })

      test("needs at least one interpretation", async () => {
        const { commands } = setup({ ...ready, interpretations: [] })
        await expect(commands.complete({ clinicId, actor: admin, id: "a1" })).rejects.toThrow("conflict")
      })

      test("completes an assessment without stages once it has an interpretation", async () => {
        const { commands } = setup({ ...ready, stages: undefined })
        expect(await commands.complete({ clinicId, actor: admin, id: "a1" })).toMatchObject({ status: "completed" })
      })
    })

    describe("cancel", () => {
      test("cancels with a reason and records the event", async () => {
        const { commands } = setup(assessment())
        const result = await commands.cancel({ clinicId, actor: professional, id: "a1", body: { reason: "Paciente desistiu" } })
        expect(result).toMatchObject({
          status: "cancelled", cancelReason: "Paciente desistiu", events: [{ action: "cancel", actor: "pro-1", at }],
        })
      })

      test.each([["short", { reason: "ruim" }], ["missing", {}], ["a non-object body", "text"]])(
        "rejects a %s reason",
        async (_label, body) => {
          const { repository, commands } = setup(assessment())
          await expect(commands.cancel({ clinicId, actor: admin, id: "a1", body })).rejects.toThrow("validation")
          expect(repository.patched).toEqual([])
        },
      )
    })

    test("refuse a stored assessment that lost its patient", async () => {
      const { repository, commands } = setup(assessment({ patientId: undefined }))
      await expect(commands.cancel({ clinicId, actor: admin, id: "a1", body: { reason: "motivo válido" } })).rejects.toThrow("validation")
      expect(repository.patched).toEqual([])
    })
  })
})
