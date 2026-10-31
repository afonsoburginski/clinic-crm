import type { Actor } from "@/application/ports/patient-access"
import type { AbaFields } from "@/domain/aba"

export type AbaKind = "aba-plan" | "aba-session"
export type AbaPayload = Record<string, unknown>
export interface AbaRecord { id: string; [field: string]: unknown }
export type AbaGoal = AbaFields

export interface AbaFilters { patientId?: string; status?: string; from?: string; to?: string }

export interface ListAbaRecordsQuery { clinicId: string; actor: Actor; filters: AbaFilters }
export interface GetAbaRecordQuery { clinicId: string; actor: Actor; id: string }
export interface ListAbaPlanGoalsQuery { clinicId: string; actor: Actor; id: string }

/** `body` is the raw request payload; use cases validate it before it reaches the repository. */
export interface CreateAbaRecordCommand { clinicId: string; actor: Actor; body: unknown }
export interface UpdateAbaRecordCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface ActivateAbaPlanCommand { clinicId: string; actor: Actor; id: string }
export interface CloseAbaPlanCommand { clinicId: string; actor: Actor; id: string }
export interface AddAbaGoalCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface UpdateAbaGoalCommand { clinicId: string; actor: Actor; id: string; goalId: string; body: unknown }
export interface VoidAbaSessionCommand { clinicId: string; actor: Actor; id: string; body: unknown }

/** `professionalId` limits the result to patients linked to that professional. */
export interface FindAbaRecordsQuery { clinicId: string; kind: AbaKind; filters: AbaFilters; professionalId?: string }

export interface AbaAudit { action: "create" | "update"; summary: string }

export interface InsertAbaRecordCommand {
  clinicId: string
  kind: AbaKind
  actorId: string
  payload: AbaPayload
  audit: AbaAudit
}

/** Runs against the row under lock: returns the fields to merge over the stored payload, or throws to abort. */
export type AbaChange = (current: AbaRecord) => AbaPayload

export interface ChangeAbaRecordCommand {
  clinicId: string
  kind: AbaKind
  id: string
  actorId: string
  change: AbaChange
  audit: AbaAudit
}

export type ChangeAbaRecordResult =
  | { outcome: "saved"; record: AbaRecord }
  | { outcome: "not_found" }

export interface AbaQueryRepository {
  find(query: FindAbaRecordsQuery): Promise<AbaRecord[]>
  findById(clinicId: string, kind: AbaKind, id: string): Promise<AbaRecord | undefined>
}

export interface AbaCommandRepository {
  insert(command: InsertAbaRecordCommand): Promise<AbaRecord>
  change(command: ChangeAbaRecordCommand): Promise<ChangeAbaRecordResult>
}

export interface AbaRepository extends AbaQueryRepository, AbaCommandRepository {}
