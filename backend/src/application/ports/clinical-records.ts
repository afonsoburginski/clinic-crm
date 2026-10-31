import type { Actor } from "@/application/ports/patient-access"

export type ClinicalRecordPayload = Record<string, unknown>
export interface ClinicalRecord { id: string; [field: string]: unknown }

export interface ClinicalRecordFilters { patientId?: string; status?: string; from?: string; to?: string }

export interface ListClinicalRecordsQuery { clinicId: string; actor: Actor; filters: ClinicalRecordFilters }
export interface ListClinicalPatientsQuery { clinicId: string; actor: Actor }
export interface GetClinicalRecordQuery { clinicId: string; actor: Actor; id: string }
export interface ListClinicalRecordVersionsQuery { clinicId: string; actor: Actor; id: string }

/** `body` is the raw request payload; use cases validate it before it reaches the repository. */
export interface CreateClinicalRecordCommand { clinicId: string; actor: Actor; body: unknown }
export interface UpdateClinicalRecordCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface FinalizeClinicalRecordCommand { clinicId: string; actor: Actor; id: string }
export interface RectifyClinicalRecordCommand { clinicId: string; actor: Actor; id: string; body: unknown }

/** `professionalId` limits the result to patients linked to that professional. */
export interface FindClinicalRecordsQuery { clinicId: string; filters: ClinicalRecordFilters; professionalId?: string }

export interface ClinicalRecordAudit { action: "create" | "update"; summary: string }

export interface InsertClinicalRecordCommand {
  clinicId: string
  actorId: string
  payload: ClinicalRecordPayload
  audit: ClinicalRecordAudit
}

/** `patch` is shallow-merged over the stored payload under a row lock, once `expectedStatus` holds. */
export interface PatchClinicalRecordCommand {
  clinicId: string
  id: string
  actorId: string
  patch: ClinicalRecordPayload
  expectedStatus: string
  /** Finalized record superseded by this change, updated in the same transaction. */
  supersedesId?: string
  audit: ClinicalRecordAudit
}

export type PatchClinicalRecordResult =
  | { outcome: "saved"; record: ClinicalRecord }
  | { outcome: "not_found" }
  | { outcome: "conflict" }

export interface ClinicalRecordQueryRepository {
  find(query: FindClinicalRecordsQuery): Promise<ClinicalRecord[]>
  findById(clinicId: string, id: string): Promise<ClinicalRecord | undefined>
}

export interface ClinicalRecordCommandRepository {
  insert(command: InsertClinicalRecordCommand): Promise<ClinicalRecord>
  patch(command: PatchClinicalRecordCommand): Promise<PatchClinicalRecordResult>
}

export interface ClinicalRecordRepository extends ClinicalRecordQueryRepository, ClinicalRecordCommandRepository {}
