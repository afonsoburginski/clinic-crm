import type {
  AbaAudit,
  AbaChange,
  AbaGoal,
  AbaKind,
  AbaPayload,
  AbaQueryRepository,
  AbaRecord,
  AbaRepository,
  ActivateAbaPlanCommand,
  AddAbaGoalCommand,
  CloseAbaPlanCommand,
  CreateAbaRecordCommand,
  GetAbaRecordQuery,
  ListAbaPlanGoalsQuery,
  ListAbaRecordsQuery,
  UpdateAbaGoalCommand,
  UpdateAbaRecordCommand,
  VoidAbaSessionCommand,
} from "@/application/ports/aba"
import type { Actor, PatientAccessPolicy } from "@/application/ports/patient-access"
import {
  assertAuthenticated,
  fieldsOf,
  isRecord,
  listOf,
  patientIdOf,
  professionalScopeOf,
  textLength,
} from "@/application/use-cases/clinical-payload"
import { withLegacyCreationDefaults } from "@/application/use-cases/legacy-defaults"
import { goalsWithProgress } from "@/domain/aba"

const PLAN: AbaKind = "aba-plan"
const SESSION: AbaKind = "aba-session"
const CLOSED = "closed"
const MIN_CRITERIA_LENGTH = 10
const MIN_VOID_REASON_LENGTH = 5

export interface AbaRuntime {
  now(): Date
  newId(): string
}

const systemRuntime: AbaRuntime = { now: () => new Date(), newId: () => crypto.randomUUID() }

function auditEntry(kind: AbaKind, action: AbaAudit["action"]): AbaAudit {
  return { action, summary: `Alterou ${kind}` }
}

/** Create and update rules: a plan needs a patient and a title; a session is stored as sent. */
function validRecord(kind: AbaKind, body: unknown): AbaPayload {
  if (!isRecord(body)) throw new Error("validation")
  if (kind === PLAN && (!body.patientId || !body.title)) throw new Error("validation")
  return body
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
}

/** Goal rules shared by creation and update: a described criteria, a target of 1-100% and 1-10 whole consecutive sessions. */
function assertValidGoal(goal: Record<string, unknown>): void {
  const valid =
    textLength(goal.criteria) >= MIN_CRITERIA_LENGTH &&
    inRange(goal.targetPercent, 1, 100) &&
    inRange(goal.consecutiveSessions, 1, 10) &&
    Number.isInteger(goal.consecutiveSessions)
  if (!valid) throw new Error("validation")
}

/** A closed plan only accepts an update that changes nothing. */
function assertPlanEditable(current: AbaRecord, patch: AbaPayload): void {
  if (current.status === CLOSED && JSON.stringify({ ...current, ...patch }) !== JSON.stringify(current)) {
    throw new Error("conflict")
  }
}

async function load(repository: AbaQueryRepository, clinicId: string, kind: AbaKind, id: string): Promise<AbaRecord> {
  const record = await repository.findById(clinicId, kind, id)
  if (!record) throw new Error("not_found")
  return record
}

export function createAbaQueries(repository: AbaQueryRepository, access: PatientAccessPolicy) {
  const list = (kind: AbaKind) => async (query: ListAbaRecordsQuery) =>
    repository.find({
      clinicId: query.clinicId, kind, filters: query.filters, professionalId: professionalScopeOf(query.actor),
    })
  const get = (kind: AbaKind) => async (query: GetAbaRecordQuery): Promise<AbaRecord> => {
    const record = await load(repository, query.clinicId, kind, query.id)
    await access.assertAccess(patientIdOf(record), query.actor)
    return record
  }

  return {
    listPlans: list(PLAN),
    getPlan: get(PLAN),
    listSessions: list(SESSION),
    getSession: get(SESSION),
    /** Goals of a plan with their progress, measured from the sessions of the same patient and professional. */
    async listPlanGoals(query: ListAbaPlanGoalsQuery): Promise<AbaGoal[]> {
      const plan = await load(repository, query.clinicId, PLAN, query.id)
      await access.assertAccess(patientIdOf(plan), query.actor)
      const sessions = await repository.find({
        clinicId: query.clinicId,
        kind: SESSION,
        filters: { patientId: patientIdOf(plan) },
        professionalId: query.actor.professionalId,
      })
      return goalsWithProgress(listOf(plan.goals), sessions, plan.id)
    },
  }
}

export function createAbaCommands(
  repository: AbaRepository,
  access: PatientAccessPolicy,
  runtime: AbaRuntime = systemRuntime,
) {
  async function change(
    kind: AbaKind,
    clinicId: string,
    actorId: string,
    id: string,
    decide: AbaChange,
  ): Promise<AbaRecord> {
    const result = await repository.change({
      clinicId, kind, id, actorId, change: decide, audit: auditEntry(kind, "update"),
    })
    if (result.outcome === "not_found") throw new Error("not_found")
    return result.record
  }

  async function create(kind: AbaKind, command: CreateAbaRecordCommand): Promise<AbaRecord> {
    await access.assertAccess(patientIdOf(command.body), command.actor)
    const payload = validRecord(kind, command.body)
    return repository.insert({
      clinicId: command.clinicId,
      kind,
      actorId: command.actor.userId,
      payload: withLegacyCreationDefaults(payload, command.actor.userId),
      audit: auditEntry(kind, "create"),
    })
  }

  async function update(kind: AbaKind, command: UpdateAbaRecordCommand): Promise<AbaRecord> {
    const current = await load(repository, command.clinicId, kind, command.id)
    await access.assertAccess(patientIdOf(current), command.actor)
    const patch = validRecord(kind, command.body)
    return change(kind, command.clinicId, command.actor.userId, command.id, (locked) => {
      if (kind === PLAN) assertPlanEditable(locked, patch)
      return patch
    })
  }

  /**
   * Runs one action: `decide` sees the locked row and returns the changed fields. A plan must stay
   * valid once the fields are applied.
   */
  async function act(
    kind: AbaKind,
    command: { clinicId: string; actor: Actor; id: string },
    decide: (current: AbaRecord, at: string) => AbaPayload,
  ): Promise<AbaRecord> {
    assertAuthenticated(command.actor)
    const current = await load(repository, command.clinicId, kind, command.id)
    await access.assertAccess(patientIdOf(current), command.actor)
    return change(kind, command.clinicId, command.actor.userId, command.id, (locked) => {
      const changes = decide(locked, runtime.now().toISOString())
      validRecord(kind, { ...locked, ...changes })
      return changes
    })
  }

  return {
    createPlan: (command: CreateAbaRecordCommand) => create(PLAN, command),
    updatePlan: (command: UpdateAbaRecordCommand) => update(PLAN, command),
    createSession: (command: CreateAbaRecordCommand) => create(SESSION, command),
    updateSession: (command: UpdateAbaRecordCommand) => update(SESSION, command),
    /** A plan can only be activated while it has an active goal. */
    activatePlan: (command: ActivateAbaPlanCommand) =>
      act(PLAN, command, (current) => {
        const hasActiveGoal = listOf(current.goals).some((goal) => isRecord(goal) && goal.status === "active")
        if (current.status === CLOSED || !hasActiveGoal) throw new Error("conflict")
        return { status: "active" }
      }),
    closePlan: (command: CloseAbaPlanCommand) =>
      act(PLAN, command, (current, at) => {
        if (current.status === CLOSED) throw new Error("conflict")
        return { status: CLOSED, closedAt: at }
      }),
    addGoal: (command: AddAbaGoalCommand) =>
      act(PLAN, command, (current) => {
        const goal = fieldsOf(command.body)
        assertValidGoal(goal)
        if (current.status === CLOSED) throw new Error("conflict")
        return { goals: [...listOf(current.goals), { ...goal, id: runtime.newId(), status: "active", progress: 0 }] }
      }),
    /** The body is merged into the stored goal and the result must pass the creation rules; id, status and progress stay as stored. */
    updateGoal: (command: UpdateAbaGoalCommand) =>
      act(PLAN, command, (current) => {
        if (current.status === CLOSED) throw new Error("conflict")
        const goals = listOf(current.goals)
        const stored = goals.find(
          (goal): goal is Record<string, unknown> => isRecord(goal) && goal.id === command.goalId,
        )
        if (!stored) throw new Error("not_found")
        const merged = {
          ...stored, ...fieldsOf(command.body), goalId: command.goalId,
          id: stored.id, status: stored.status, progress: stored.progress,
        }
        assertValidGoal(merged)
        return { goals: goals.map((goal) => (goal === stored ? merged : goal)) }
      }),
    /** The reason is checked untrimmed, unlike the other cancellation reasons. */
    voidSession: (command: VoidAbaSessionCommand) =>
      act(SESSION, command, () => {
        const { reason } = fieldsOf(command.body)
        if (String(reason ?? "").length < MIN_VOID_REASON_LENGTH) throw new Error("validation")
        return { voided: true, voidReason: reason }
      }),
  }
}

export function createAbaUseCases(
  repository: AbaRepository,
  access: PatientAccessPolicy,
  runtime: AbaRuntime = systemRuntime,
) {
  return {
    queries: createAbaQueries(repository, access),
    commands: createAbaCommands(repository, access, runtime),
  }
}

export type AbaUseCases = ReturnType<typeof createAbaUseCases>
