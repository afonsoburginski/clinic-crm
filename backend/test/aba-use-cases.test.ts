import { describe, expect, test } from "bun:test"
import type { AbaRecord } from "@/application/ports/aba"
import type { Actor } from "@/application/ports/patient-access"
import { createAbaCommands, createAbaQueries, type AbaRuntime } from "@/application/use-cases/aba"
import { FakeAbaRepository } from "./fakes/aba-repository"
import { FakePatientAccess } from "./fakes/patient-access"

const clinicId = "clinic"
const admin: Actor = { userId: "admin-1", roles: ["admin"] }
const professional: Actor = { userId: "pro-1", roles: ["professional"], professionalId: "pr1" }
const at = "2025-03-01T12:00:00.000Z"
const runtime: AbaRuntime = { now: () => new Date(at), newId: () => "goal-new" }
const criteria = "Responder ao nome em 8 de 10 tentativas."

const firstGoal = { id: "g1", status: "active", criteria, targetPercent: 80, consecutiveSessions: 2, progress: 0 }

function plan(fields: Partial<AbaRecord> = {}): AbaRecord {
  return { id: "pl1", patientId: "p1", title: "Plano inicial", status: "draft", goals: [firstGoal], ...fields }
}

function setup(plans: AbaRecord[] = [], sessions: AbaRecord[] = []) {
  const repository = new FakeAbaRepository()
  repository.records["aba-plan"] = plans
  repository.records["aba-session"] = sessions
  const access = new FakePatientAccess()
  access.linkedPatients.add("p1")
  return {
    repository,
    access,
    queries: createAbaQueries(repository, access),
    commands: createAbaCommands(repository, access, runtime),
  }
}

describe("aba queries", () => {
  test("scopes lists to the professional, and leaves other roles unscoped", async () => {
    const { repository, queries } = setup([plan()])
    const filters = { patientId: "p1", status: "draft", from: "2025-01-01", to: "2025-02-01" }
    expect(await queries.listPlans({ clinicId, actor: professional, filters })).toEqual([plan()])
    expect(repository.found[0]).toEqual({ clinicId, kind: "aba-plan", filters, professionalId: "pr1" })
    await queries.listSessions({ clinicId, actor: { ...admin, professionalId: "pr9" }, filters: {} })
    expect(repository.found[1]).toEqual({ clinicId, kind: "aba-session", filters: {}, professionalId: undefined })
  })

  test("forbids a professional without a professional link from listing, instead of listing everything", async () => {
    const { repository, queries } = setup([plan()], [{ id: "s1", patientId: "p1" }])
    const unlinked: Actor = { userId: "u", roles: ["professional"] }
    await expect(queries.listPlans({ clinicId, actor: unlinked, filters: {} })).rejects.toThrow("forbidden")
    await expect(queries.listSessions({ clinicId, actor: unlinked, filters: {} })).rejects.toThrow("forbidden")
    expect(repository.found).toEqual([])
  })

  test("gets a plan or session after checking access to its patient", async () => {
    const { access, queries } = setup([plan(), plan({ id: "pl2", patientId: "p2" })], [{ id: "s1", patientId: "p1" }])
    expect(await queries.getPlan({ clinicId, actor: professional, id: "pl1" })).toEqual(plan())
    expect(await queries.getSession({ clinicId, actor: professional, id: "s1" })).toEqual({ id: "s1", patientId: "p1" })
    expect(access.checked.map((entry) => entry.patientId)).toEqual(["p1", "p1"])
    await expect(queries.getPlan({ clinicId, actor: professional, id: "pl2" })).rejects.toThrow("forbidden")
    await expect(queries.getPlan({ clinicId, actor: professional, id: "missing" })).rejects.toThrow("not_found")
    await expect(queries.getSession({ clinicId, actor: professional, id: "missing" })).rejects.toThrow("not_found")
  })

  describe("plan goals", () => {
    const measure = (goalId: string, percent: unknown, extra: Record<string, unknown> = {}) => ({ goalId, percent, ...extra })

    test("derives progress from the newest counted session and completes on consecutive hits", async () => {
      const sessions: AbaRecord[] = [
        { id: "old", date: "2025-02-01", measures: [measure("g1", 90), measure("g2", 40)] },
        { id: "new", date: "2025-02-10", measures: [measure("g1", 85.4), measure("g2", 50.5)] },
        { id: "voided", date: "2025-02-20", voided: true, measures: [measure("g1", 10)] },
        { id: "other-plan", date: "2025-02-25", planId: "pl9", measures: [measure("g1", 0)] },
        { id: "own-plan", createdAt: "2025-02-05", planId: "pl1", measures: [measure("g1", 99, { voided: true })] },
      ]
      const goals = [
        { id: "g1", status: "active", targetPercent: 80, consecutiveSessions: 2 },
        { id: "g2", status: "active", targetPercent: 80, consecutiveSessions: 2 },
        { id: "g3", status: "active", targetPercent: 80 },
      ]
      const { repository, queries } = setup([plan({ goals })], sessions)
      const result = await queries.listPlanGoals({ clinicId, actor: professional, id: "pl1" })
      expect(result).toEqual([
        { id: "g1", status: "completed", targetPercent: 80, consecutiveSessions: 2, progress: 85 },
        { id: "g2", status: "active", targetPercent: 80, consecutiveSessions: 2, progress: 51 },
        { id: "g3", status: "active", targetPercent: 80, progress: 0 },
      ])
      expect(repository.found[0]).toEqual({
        clinicId, kind: "aba-session", filters: { patientId: "p1" }, professionalId: "pr1",
      })
    })

    test("needs as many measures as consecutive sessions, each reaching the target", async () => {
      const goal = { id: "g1", status: "active", targetPercent: 80, consecutiveSessions: 3 }
      const sessions: AbaRecord[] = [
        { id: "a", date: "2025-02-01", measures: [measure("g1", 90)] },
        { id: "b", date: "2025-02-02", measures: [measure("g1", 90), measure("g1", "x"), measure("g1", Number.NaN)] },
      ]
      const { queries } = setup([plan({ goals: [goal] })], sessions)
      const [short] = await queries.listPlanGoals({ clinicId, actor: admin, id: "pl1" })
      expect(short).toMatchObject({ status: "active", progress: 90 })
    })

    test("checks access, and a missing plan is not found", async () => {
      const { queries } = setup([plan({ patientId: "p2" })])
      await expect(queries.listPlanGoals({ clinicId, actor: professional, id: "pl1" })).rejects.toThrow("forbidden")
      await expect(queries.listPlanGoals({ clinicId, actor: professional, id: "none" })).rejects.toThrow("not_found")
    })

    test("a plan without goals has none to report", async () => {
      const { queries } = setup([plan({ goals: undefined })])
      expect(await queries.listPlanGoals({ clinicId, actor: admin, id: "pl1" })).toEqual([])
    })
  })
})

describe("aba commands", () => {
  describe("create and update", () => {
    test("creates a plan authored by the actor and audits the creation", async () => {
      const { repository, commands } = setup()
      const created = await commands.createPlan({ clinicId, actor: professional, body: { patientId: "p1", title: "Plano" } })
      expect(created).toEqual({ id: "new", patientId: "p1", title: "Plano", createdBy: "pro-1", status: "draft" })
      expect(repository.inserted[0]).toMatchObject({
        clinicId, kind: "aba-plan", actorId: "pro-1", audit: { action: "create", summary: "Alterou aba-plan" },
      })
    })

    test("legacy: a client-sent status and author are kept", async () => {
      const { commands } = setup()
      const created = await commands.createPlan({
        clinicId, actor: admin, body: { patientId: "p1", title: "Plano", status: "active", createdBy: "other" },
      })
      expect(created).toMatchObject({ status: "active", createdBy: "other" })
    })

    test("checks patient access before validating the body", async () => {
      const { repository, commands } = setup()
      await expect(commands.createPlan({ clinicId, actor: professional, body: {} })).rejects.toThrow("forbidden")
      await expect(commands.createPlan({ clinicId, actor: professional, body: { patientId: "p2", title: "x" } }))
        .rejects.toThrow("forbidden")
      await expect(commands.createPlan({ clinicId, actor: admin, body: { patientId: "p1" } })).rejects.toThrow("validation")
      await expect(commands.createPlan({ clinicId, actor: admin, body: { title: "x" } })).rejects.toThrow("validation")
      await expect(commands.createPlan({ clinicId, actor: admin, body: [] })).rejects.toThrow("validation")
      expect(repository.inserted).toEqual([])
    })

    test("a session needs no fields beyond an object body", async () => {
      const { repository, commands } = setup()
      expect(await commands.createSession({ clinicId, actor: admin, body: {} }))
        .toEqual({ id: "new", createdBy: "admin-1", status: "draft" })
      expect(repository.inserted[0]).toMatchObject({ kind: "aba-session", audit: { summary: "Alterou aba-session" } })
      await expect(commands.createSession({ clinicId, actor: professional, body: {} })).rejects.toThrow("forbidden")
      await expect(commands.createSession({ clinicId, actor: admin, body: null })).rejects.toThrow("validation")
    })

    test("updates after checking access, validating the body, and finding the record", async () => {
      const { repository, commands } = setup([plan(), plan({ id: "pl2", patientId: "p2" })])
      const body = { patientId: "p1", title: "Novo título" }
      expect(await commands.updatePlan({ clinicId, actor: professional, id: "pl1", body })).toEqual({ ...plan(), ...body })
      expect(repository.changed[0]).toMatchObject({
        kind: "aba-plan", id: "pl1", actorId: "pro-1", audit: { action: "update", summary: "Alterou aba-plan" },
      })
      await expect(commands.updatePlan({ clinicId, actor: professional, id: "pl2", body })).rejects.toThrow("forbidden")
      await expect(commands.updatePlan({ clinicId, actor: admin, id: "missing", body: {} })).rejects.toThrow("not_found")
      await expect(commands.updatePlan({ clinicId, actor: admin, id: "pl1", body: { title: "x" } })).rejects.toThrow("validation")
      expect(repository.changed).toHaveLength(1)
    })

    test("a closed plan only accepts an update that changes nothing", async () => {
      const { commands } = setup([plan({ status: "closed" })])
      const same = { patientId: "p1", title: "Plano inicial" }
      expect(await commands.updatePlan({ clinicId, actor: admin, id: "pl1", body: same })).toMatchObject({ status: "closed" })
      await expect(commands.updatePlan({ clinicId, actor: admin, id: "pl1", body: { ...same, title: "Outro" } }))
        .rejects.toThrow("conflict")
    })

    test("a session update has no closed rule", async () => {
      const { commands } = setup([], [{ id: "s1", patientId: "p1", status: "closed" }])
      expect(await commands.updateSession({ clinicId, actor: admin, id: "s1", body: { note: "n" } }))
        .toEqual({ id: "s1", patientId: "p1", status: "closed", note: "n" })
    })
  })

  describe("plan actions", () => {
    test("activates a plan that has an active goal", async () => {
      const { repository, commands } = setup([plan()])
      expect(await commands.activatePlan({ clinicId, actor: professional, id: "pl1" })).toMatchObject({ status: "active" })
      expect(repository.changed[0]).toMatchObject({ kind: "aba-plan", actorId: "pro-1" })
    })

    test("refuses to activate a closed plan or one without an active goal", async () => {
      const closed = setup([plan({ status: "closed" })])
      await expect(closed.commands.activatePlan({ clinicId, actor: admin, id: "pl1" })).rejects.toThrow("conflict")
      const noGoal = setup([plan({ goals: [{ id: "g1", status: "done" }] })])
      await expect(noGoal.commands.activatePlan({ clinicId, actor: admin, id: "pl1" })).rejects.toThrow("conflict")
      const empty = setup([plan({ goals: undefined })])
      await expect(empty.commands.activatePlan({ clinicId, actor: admin, id: "pl1" })).rejects.toThrow("conflict")
    })

    test("closes a plan once, stamping when", async () => {
      const { commands } = setup([plan(), plan({ id: "pl2", status: "closed" })])
      expect(await commands.closePlan({ clinicId, actor: admin, id: "pl1" })).toMatchObject({ status: "closed", closedAt: at })
      await expect(commands.closePlan({ clinicId, actor: admin, id: "pl2" })).rejects.toThrow("conflict")
    })

    test("every plan action checks access, authentication and existence first", async () => {
      const { repository, access, commands } = setup([plan()])
      const target = { clinicId, id: "pl1" }
      const calls = [
        (actor: Actor) => commands.activatePlan({ ...target, actor }),
        (actor: Actor) => commands.closePlan({ ...target, actor }),
        (actor: Actor) => commands.addGoal({ ...target, actor, body: { criteria, targetPercent: 80, consecutiveSessions: 3 } }),
        (actor: Actor) => commands.updateGoal({ ...target, actor, goalId: "g1", body: {} }),
      ]
      for (const call of calls) {
        access.linkedPatients.clear()
        await expect(call(professional)).rejects.toThrow("forbidden")
        await expect(call({ ...admin, userId: "system" })).rejects.toThrow("unauthorized")
        await expect(call({ ...admin, userId: "" })).rejects.toThrow("unauthorized")
      }
      await expect(commands.closePlan({ clinicId, actor: admin, id: "missing" })).rejects.toThrow("not_found")
      expect(repository.changed).toEqual([])
    })

    test("a plan that is no longer valid cannot take an action", async () => {
      const { commands } = setup([plan({ title: undefined })])
      await expect(commands.closePlan({ clinicId, actor: admin, id: "pl1" })).rejects.toThrow("validation")
    })
  })

  describe("goals", () => {
    const goal = { criteria, targetPercent: 80, consecutiveSessions: 3 }

    test("adds an active goal with a fresh id, over whatever id and status the body sent", async () => {
      const { commands } = setup([plan()])
      const result = await commands.addGoal({
        clinicId, actor: professional, id: "pl1", body: { ...goal, id: "x", status: "done", progress: 70, note: "n" },
      })
      expect(result.goals).toEqual([
        firstGoal,
        { ...goal, note: "n", id: "goal-new", status: "active", progress: 0 },
      ])
    })

    test.each([
      ["short criteria", { ...goal, criteria: "curto" }],
      ["blank criteria", { ...goal, criteria: "          " }],
      ["no target", { ...goal, targetPercent: undefined }],
      ["target as text", { ...goal, targetPercent: "80" }],
      ["target below 1", { ...goal, targetPercent: 0 }],
      ["target above 100", { ...goal, targetPercent: 101 }],
      ["infinite target", { ...goal, targetPercent: Infinity }],
      ["fractional sessions", { ...goal, consecutiveSessions: 1.5 }],
      ["no sessions", { ...goal, consecutiveSessions: 0 }],
      ["too many sessions", { ...goal, consecutiveSessions: 11 }],
      ["no body fields", {}],
    ])("rejects a goal with %s", async (_name, body) => {
      const { commands } = setup([plan()])
      await expect(commands.addGoal({ clinicId, actor: admin, id: "pl1", body })).rejects.toThrow("validation")
    })

    test("accepts the limits of the allowed ranges", async () => {
      const { commands } = setup([plan()])
      for (const [targetPercent, consecutiveSessions] of [[1, 1], [100, 10], [33.3, 5]]) {
        await commands.addGoal({ clinicId, actor: admin, id: "pl1", body: { ...goal, targetPercent, consecutiveSessions } })
      }
    })

    test("reports validation before the closed plan conflict", async () => {
      const { commands } = setup([plan({ status: "closed" })])
      await expect(commands.addGoal({ clinicId, actor: admin, id: "pl1", body: {} })).rejects.toThrow("validation")
      await expect(commands.addGoal({ clinicId, actor: admin, id: "pl1", body: goal })).rejects.toThrow("conflict")
    })

    const update = (body: unknown, goalId = "g1") => ({ clinicId, actor: admin, id: "pl1", goalId, body })

    test("updates a goal by merging the body into the stored one, plus the goal id", async () => {
      const { commands } = setup([plan()])
      const result = await commands.updateGoal({
        clinicId, actor: professional, id: "pl1", goalId: "g1", body: { goalId: "ignored", targetPercent: 5 },
      })
      expect(result.goals).toEqual([{ ...firstGoal, targetPercent: 5, goalId: "g1" }])
    })

    test("keeps the stored id, status and progress over whatever the body sent", async () => {
      const { commands } = setup([plan({ goals: [firstGoal, { ...firstGoal, id: "g2" }] })])
      const result = await commands.updateGoal(update({ id: "x", status: "completed", progress: 100, targetPercent: 90 }))
      expect(result.goals).toEqual([
        { ...firstGoal, targetPercent: 90, goalId: "g1" },
        { ...firstGoal, id: "g2" },
      ])
    })

    test.each([
      ["short criteria", { criteria: "curto" }],
      ["blank criteria", { criteria: "          " }],
      ["target as text", { targetPercent: "80" }],
      ["target below 1", { targetPercent: 0 }],
      ["target above 100", { targetPercent: 101 }],
      ["infinite target", { targetPercent: Infinity }],
      ["fractional sessions", { consecutiveSessions: 1.5 }],
      ["no sessions", { consecutiveSessions: 0 }],
      ["too many sessions", { consecutiveSessions: 11 }],
    ])("rejects an update that leaves the goal with %s", async (_name, body) => {
      const { commands } = setup([plan()])
      await expect(commands.updateGoal(update(body))).rejects.toThrow("validation")
    })

    test("validates the merged goal, so a stored goal that breaks the rules needs a fixing body", async () => {
      const broken = { id: "g1", status: "active", targetPercent: 80, consecutiveSessions: 2, progress: 0 }
      const { commands } = setup([plan({ goals: [broken] })])
      await expect(commands.updateGoal(update({ targetPercent: 70 }))).rejects.toThrow("validation")
      const fixed = await commands.updateGoal(update({ criteria }))
      expect(fixed.goals).toEqual([{ ...broken, criteria, goalId: "g1" }])
    })

    test("accepts the limits of the allowed ranges", async () => {
      const { commands } = setup([plan()])
      for (const [targetPercent, consecutiveSessions] of [[1, 1], [100, 10], [33.3, 5]]) {
        await commands.updateGoal(update({ targetPercent, consecutiveSessions }))
      }
    })

    test("reports a closed plan before an unknown goal", async () => {
      const closed = setup([plan({ status: "closed" })])
      await expect(closed.commands.updateGoal({ clinicId, actor: admin, id: "pl1", goalId: "none", body: {} }))
        .rejects.toThrow("conflict")
      const open = setup([plan()])
      await expect(open.commands.updateGoal({ clinicId, actor: admin, id: "pl1", goalId: "none", body: {} }))
        .rejects.toThrow("not_found")
    })
  })

  describe("void session", () => {
    const session = { id: "s1", patientId: "p1", status: "draft" }

    test("voids a session with a reason of at least five characters, untrimmed", async () => {
      const { repository, commands } = setup([], [session])
      const result = await commands.voidSession({ clinicId, actor: professional, id: "s1", body: { reason: "  a  b " } })
      expect(result).toEqual({ ...session, voided: true, voidReason: "  a  b " })
      expect(repository.changed[0]).toMatchObject({ kind: "aba-session", audit: { summary: "Alterou aba-session" } })
      for (const body of [{}, { reason: "curt" }, null]) {
        await expect(commands.voidSession({ clinicId, actor: admin, id: "s1", body })).rejects.toThrow("validation")
      }
    })

    test("checks access and existence", async () => {
      const { access, commands } = setup([], [session])
      access.linkedPatients.clear()
      await expect(commands.voidSession({ clinicId, actor: professional, id: "s1", body: { reason: "motivo" } }))
        .rejects.toThrow("forbidden")
      await expect(commands.voidSession({ clinicId, actor: admin, id: "none", body: { reason: "motivo" } }))
        .rejects.toThrow("not_found")
    })
  })
})
