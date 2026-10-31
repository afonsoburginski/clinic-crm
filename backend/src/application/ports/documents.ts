import type { Actor } from "@/application/ports/patient-access"

export type DocumentPayload = Record<string, unknown>
export interface DocumentRecord { id: string; [field: string]: unknown }

export interface DocumentFilters { patientId?: string; status?: string; from?: string; to?: string }

/** The clinical record a clinical document is issued from. */
export interface LinkedClinicalRecord { id: string; patientId?: unknown; status?: unknown }

export interface ListDocumentsQuery { clinicId: string; actor: Actor; filters: DocumentFilters }
export interface GetDocumentQuery { clinicId: string; actor: Actor; id: string }

/** `body` is the raw request payload; use cases validate it before it reaches the repository. */
export interface CreateDocumentCommand { clinicId: string; actor: Actor; body: unknown }
export interface UpdateDocumentCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface ChangeDocumentStatusCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface AddDocumentReleaseCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface RevokeDocumentReleaseCommand {
  clinicId: string
  actor: Actor
  id: string
  releaseId: string
  body: unknown
}

/** `professionalId` limits the result to patients linked to that professional. */
export interface FindDocumentsQuery { clinicId: string; filters: DocumentFilters; professionalId?: string }

export interface GuardianReceivesDocumentsQuery { clinicId: string; patientId: string; guardianId: string }

export interface DocumentAudit { action: "create" | "update"; summary: string }

export interface InsertDocumentCommand {
  clinicId: string
  actorId: string
  payload: DocumentPayload
  audit: DocumentAudit
}

/** Runs against the row under lock: returns the fields to merge over the stored payload, or throws to abort. */
export type DocumentChange = (current: DocumentRecord) => DocumentPayload

export interface ChangeDocumentCommand {
  clinicId: string
  id: string
  actorId: string
  change: DocumentChange
  audit: DocumentAudit
}

export type ChangeDocumentResult =
  | { outcome: "saved"; record: DocumentRecord }
  | { outcome: "not_found" }

export interface DocumentQueryRepository {
  find(query: FindDocumentsQuery): Promise<DocumentRecord[]>
  findById(clinicId: string, id: string): Promise<DocumentRecord | undefined>
  findClinicalRecord(clinicId: string, id: string): Promise<LinkedClinicalRecord | undefined>
  /** Whether the guardian is linked to the patient and allowed to receive documents. */
  guardianReceivesDocuments(query: GuardianReceivesDocumentsQuery): Promise<boolean>
}

export interface DocumentCommandRepository {
  insert(command: InsertDocumentCommand): Promise<DocumentRecord>
  change(command: ChangeDocumentCommand): Promise<ChangeDocumentResult>
}

export interface DocumentRepository extends DocumentQueryRepository, DocumentCommandRepository {}
