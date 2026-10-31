import type { DocumentClassification, DocumentRelease, DocumentStatus, PatientDocument } from "@/domain/types"

import { listOf, optional, text, type Row } from "./backend-mappers"
import { actorNameOf } from "./helpers"

/**
 * Documento da API (`api_resources`) → `PatientDocument`. A liberação a responsável chega como
 * `{ guardianId, active, createdBy, createdAt, revokedAt, reason | revokeReason }`.
 */
type NameOf = (actorId: string | undefined) => string

const CLASSIFICATIONS: DocumentClassification[] = ["clinical", "administrative", "financial"]
const STATUSES: DocumentStatus[] = ["draft", "issued", "archived"]

export function toDocumentRelease(raw: Row, nameOf: NameOf = actorNameOf): DocumentRelease {
  const createdAt = text(raw.createdAt)
  const revoked = raw.active === false || !!optional(raw.revokedAt)
  return {
    id: text(raw.id),
    guardianId: text(raw.guardianId),
    releasedBy: text(raw.createdBy),
    releasedByName: optional(raw.createdByName) ?? nameOf(optional(raw.createdBy)),
    releasedAt: createdAt,
    revokedAt: revoked ? (optional(raw.revokedAt) ?? createdAt) : undefined,
    revokedBy: revoked ? optional(raw.revokedBy) : undefined,
    revokeReason: revoked ? (optional(raw.reason) ?? optional(raw.revokeReason)) : undefined,
  }
}

export function toPatientDocument(raw: Row, nameOf: NameOf = actorNameOf): PatientDocument {
  const createdAt = text(raw.createdAt)
  const createdBy = text(raw.createdBy)
  const classification = CLASSIFICATIONS.find((c) => c === raw.classification) ?? "administrative"
  return {
    id: text(raw.id),
    patientId: text(raw.patientId),
    title: text(raw.title),
    type: text(raw.type),
    classification,
    status: STATUSES.find((s) => s === raw.status) ?? "draft",
    clinicalRecordId: classification === "clinical" ? optional(raw.clinicalRecordId) : undefined,
    notes: optional(raw.notes),
    releases: listOf(raw.releases).map((release) => toDocumentRelease(release, nameOf)),
    createdBy,
    createdByName: optional(raw.createdByName) ?? nameOf(createdBy),
    createdAt,
    updatedAt: text(raw.updatedAt) || createdAt,
    issuedAt: optional(raw.issuedAt),
    archivedAt: optional(raw.archivedAt),
  }
}
