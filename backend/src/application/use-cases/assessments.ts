import type {
  AddAssessmentInterpretationCommand,
  AdvanceAssessmentStageCommand,
  Assessment,
  AssessmentAudit,
  AssessmentPayload,
  AssessmentQueryRepository,
  AssessmentRepository,
  CancelAssessmentCommand,
  CompleteAssessmentCommand,
  CreateAssessmentCommand,
  GetAssessmentQuery,
  ListAssessmentsQuery,
  UpdateAssessmentCommand,
} from "@/application/ports/assessments"
import type { Actor, PatientAccessPolicy } from "@/application/ports/patient-access"
import {
  assertAuthenticated,
  fieldsOf,
  isRecord,
  listOf,
  omit,
  patientIdOf,
  professionalScopeOf,
  textLength,
} from "@/application/use-cases/clinical-payload"

const IN_PROGRESS = "in_progress"
const COMPLETED = "completed"
const CANCELLED = "cancelled"
/** Closed assessments are read-only. */
const CLOSED_STATUSES: readonly string[] = [COMPLETED, CANCELLED]
const MIN_INTERPRETATION_LENGTH = 20
const MIN_CANCEL_REASON_LENGTH = 5
const STAGE_TRANSITIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ["pending", [IN_PROGRESS]],
  [IN_PROGRESS, ["pending", COMPLETED]],
  [COMPLETED, []],
])

type AssessmentAction = "stages" | "interpretations" | "complete" | "cancel"

export interface AssessmentRuntime {
  now(): Date
  newId(): string
}

const systemRuntime: AssessmentRuntime = { now: () => new Date(), newId: () => crypto.randomUUID() }

function auditEntry(action: AssessmentAudit["action"]): AssessmentAudit {
  return { action, summary: "Alterou assessment" }
}

/** Create and update rules: an assessment belongs to a patient. */
function validAssessment(body: unknown): AssessmentPayload {
  if (!isRecord(body) || !body.patientId) throw new Error("validation")
  return body
}

async function load(repository: AssessmentQueryRepository, clinicId: string, id: string): Promise<Assessment> {
  const assessment = await repository.findById(clinicId, id)
  if (!assessment) throw new Error("not_found")
  return assessment
}

export function createAssessmentQueries(repository: AssessmentQueryRepository, access: PatientAccessPolicy) {
  return {
    async listAssessments(query: ListAssessmentsQuery): Promise<Assessment[]> {
      return repository.find({
        clinicId: query.clinicId, filters: query.filters, professionalId: professionalScopeOf(query.actor),
      })
    },
    async getAssessment(query: GetAssessmentQuery): Promise<Assessment> {
      const assessment = await load(repository, query.clinicId, query.id)
      await access.assertAccess(patientIdOf(assessment), query.actor)
      return assessment
    },
  }
}

export function createAssessmentCommands(
  repository: AssessmentRepository,
  access: PatientAccessPolicy,
  runtime: AssessmentRuntime = systemRuntime,
) {
  async function save(
    clinicId: string,
    actorId: string,
    id: string,
    patch: AssessmentPayload,
    guard: { expectedStatus?: string; blockedStatuses?: readonly string[] } = {},
  ): Promise<Assessment> {
    const result = await repository.patch({ clinicId, id, actorId, patch, ...guard, audit: auditEntry("update") })
    if (result.outcome === "not_found") throw new Error("not_found")
    if (result.outcome === "conflict") throw new Error("conflict")
    return result.record
  }

  /**
   * Runs one action on an in-progress assessment: `decide` returns the changed fields and the
   * action is appended to the event log. The repository re-checks the status under the row lock.
   */
  async function act(
    command: { clinicId: string; actor: Actor; id: string },
    action: AssessmentAction,
    decide: (current: Assessment, at: string) => AssessmentPayload,
  ): Promise<Assessment> {
    assertAuthenticated(command.actor)
    const current = await load(repository, command.clinicId, command.id)
    await access.assertAccess(patientIdOf(current), command.actor)
    if (current.status !== IN_PROGRESS) throw new Error("conflict")
    const at = runtime.now().toISOString()
    const changes = decide(current, at)
    validAssessment({ ...current, ...changes })
    const events = [...listOf(current.events), { action, actor: command.actor.userId, at }]
    return save(command.clinicId, command.actor.userId, command.id, { ...changes, events }, { expectedStatus: IN_PROGRESS })
  }

  return {
    /** Starts as pending (or in_progress if the client asks): completed/cancelled must go through their actions. */
    async createAssessment(command: CreateAssessmentCommand): Promise<Assessment> {
      await access.assertAccess(patientIdOf(command.body), command.actor)
      const payload = omit(validAssessment(command.body), ["id"])
      const requested = payload.status
      const status = requested === IN_PROGRESS || requested === "pending" ? requested : "pending"
      return repository.insert({
        clinicId: command.clinicId,
        actorId: command.actor.userId,
        payload: { ...payload, createdBy: payload.createdBy ?? command.actor.userId, status },
        audit: auditEntry("create"),
      })
    },
    /** Completed and cancelled assessments are read-only; status itself is managed only by the dedicated actions. */
    async updateAssessment(command: UpdateAssessmentCommand): Promise<Assessment> {
      const current = await load(repository, command.clinicId, command.id)
      await access.assertAccess(patientIdOf(current), command.actor)
      const body = validAssessment(command.body)
      if ("status" in body) throw new Error("validation")
      const patch = omit(body, ["id"])
      if (patch.patientId !== current.patientId) await access.assertAccess(patientIdOf(patch), command.actor)
      if (typeof current.status === "string" && CLOSED_STATUSES.includes(current.status)) throw new Error("conflict")
      return save(command.clinicId, command.actor.userId, command.id, patch, { blockedStatuses: CLOSED_STATUSES })
    },
    /** Moves one stage along `pending → in_progress → completed` (`in_progress` may go back to `pending`). */
    advanceStage: (command: AdvanceAssessmentStageCommand) =>
      act(command, "stages", (current) => {
        const { stageId, status } = fieldsOf(command.body)
        const stages = listOf(current.stages)
        const stage = stages.find((entry) => isRecord(entry) && entry.id === stageId)
        if (!isRecord(stage)) throw new Error("not_found")
        const allowed = typeof stage.status === "string" ? STAGE_TRANSITIONS.get(stage.status) : undefined
        if (typeof status !== "string" || !allowed?.includes(status)) throw new Error("conflict")
        return {
          stages: stages.map((entry) =>
            isRecord(entry) && entry.id === stageId ? { ...entry, status, updatedBy: command.actor.userId } : entry,
          ),
        }
      }),
    addInterpretation: (command: AddAssessmentInterpretationCommand) =>
      act(command, "interpretations", (current, at) => {
        const { content } = fieldsOf(command.body)
        if (textLength(content) < MIN_INTERPRETATION_LENGTH) throw new Error("validation")
        const stored = listOf(current.interpretations)
        const interpretation = {
          id: runtime.newId(), version: stored.length + 1, content, createdBy: command.actor.userId, at,
        }
        return { interpretations: [...stored, interpretation] }
      }),
    /** Needs every stage completed and at least one interpretation. */
    complete: (command: CompleteAssessmentCommand) =>
      act(command, "complete", (current) => {
        const pendingStage = listOf(current.stages).some((stage) => !isRecord(stage) || stage.status !== COMPLETED)
        if (pendingStage || listOf(current.interpretations).length === 0) throw new Error("conflict")
        return { status: COMPLETED }
      }),
    cancel: (command: CancelAssessmentCommand) =>
      act(command, "cancel", () => {
        const { reason } = fieldsOf(command.body)
        if (textLength(reason) < MIN_CANCEL_REASON_LENGTH) throw new Error("validation")
        return { status: CANCELLED, cancelReason: reason }
      }),
  }
}

export function createAssessmentUseCases(
  repository: AssessmentRepository,
  access: PatientAccessPolicy,
  runtime: AssessmentRuntime = systemRuntime,
) {
  return {
    queries: createAssessmentQueries(repository, access),
    commands: createAssessmentCommands(repository, access, runtime),
  }
}

export type AssessmentUseCases = ReturnType<typeof createAssessmentUseCases>
