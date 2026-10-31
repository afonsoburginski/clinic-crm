import type { Actor } from "@/application/ports/patient-access"

export type AssessmentPayload = Record<string, unknown>
export interface Assessment { id: string; [field: string]: unknown }

export interface AssessmentFilters { patientId?: string; status?: string; from?: string; to?: string }

export interface ListAssessmentsQuery { clinicId: string; actor: Actor; filters: AssessmentFilters }
export interface GetAssessmentQuery { clinicId: string; actor: Actor; id: string }

/** `body` is the raw request payload; use cases validate it before it reaches the repository. */
export interface CreateAssessmentCommand { clinicId: string; actor: Actor; body: unknown }
export interface UpdateAssessmentCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface AdvanceAssessmentStageCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface AddAssessmentInterpretationCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface CompleteAssessmentCommand { clinicId: string; actor: Actor; id: string }
export interface CancelAssessmentCommand { clinicId: string; actor: Actor; id: string; body: unknown }

/** `professionalId` limits the result to patients linked to that professional. */
export interface FindAssessmentsQuery { clinicId: string; filters: AssessmentFilters; professionalId?: string }

export interface AssessmentAudit { action: "create" | "update"; summary: string }

export interface InsertAssessmentCommand {
  clinicId: string
  actorId: string
  payload: AssessmentPayload
  audit: AssessmentAudit
}

/**
 * `patch` is shallow-merged over the stored payload under a row lock, once `expectedStatus` (when given) holds
 * and the stored status is not one of `blockedStatuses`.
 */
export interface PatchAssessmentCommand {
  clinicId: string
  id: string
  actorId: string
  patch: AssessmentPayload
  expectedStatus?: string
  blockedStatuses?: readonly string[]
  audit: AssessmentAudit
}

export type PatchAssessmentResult =
  | { outcome: "saved"; record: Assessment }
  | { outcome: "not_found" }
  | { outcome: "conflict" }

export interface AssessmentQueryRepository {
  find(query: FindAssessmentsQuery): Promise<Assessment[]>
  findById(clinicId: string, id: string): Promise<Assessment | undefined>
}

export interface AssessmentCommandRepository {
  insert(command: InsertAssessmentCommand): Promise<Assessment>
  patch(command: PatchAssessmentCommand): Promise<PatchAssessmentResult>
}

export interface AssessmentRepository extends AssessmentQueryRepository, AssessmentCommandRepository {}
