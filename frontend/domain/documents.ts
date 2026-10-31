import { ForbiddenError, ValidationError } from "./errors"
import { canReadClinical, canWriteClinical } from "./clinical-record"
import { can } from "./permissions"
import type {
  ClinicalRecord,
  DocumentClassification,
  DocumentRelease,
  DocumentStatus,
  PatientDocument,
  PatientGuardianLink,
  User,
} from "./types"

export const CLASSIFICATION_LABELS: Record<DocumentClassification, string> = {
  clinical: "Clínico",
  administrative: "Administrativo",
  financial: "Financeiro",
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Rascunho",
  issued: "Emitido",
  archived: "Arquivado",
}

const TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  draft: ["issued", "archived"],
  issued: ["archived"],
  archived: [],
}

export function canTransitionDocument(from: DocumentStatus, to: DocumentStatus) {
  return TRANSITIONS[from].includes(to)
}

export interface DocumentAccess {
  read: boolean
  /** Criar, editar, emitir, arquivar e liberar a responsáveis (RN-DOC-004). */
  write: boolean
}

/** RN-DOC-001: o acesso depende da classificação, não só de `documents:read`. */
export function documentAccess(
  user: User | null | undefined,
  classification: DocumentClassification,
  patientIsOwn: boolean
): DocumentAccess {
  if (!can(user, "documents:read")) return { read: false, write: false }
  switch (classification) {
    case "clinical":
      return { read: canReadClinical(user, patientIsOwn), write: canWriteClinical(user, patientIsOwn) }
    case "administrative":
      return {
        read: can(user, "patients:read") || (can(user, "patients:read-own") && patientIsOwn),
        write: can(user, "patients:write"),
      }
    case "financial":
      return { read: can(user, "finance:read"), write: can(user, "finance:write") }
  }
}

export function activeReleases(doc: Pick<PatientDocument, "releases">) {
  return doc.releases.filter((r) => !r.revokedAt)
}

/**
 * RN-DOC-003: rascunho é editável; emitir documento clínico exige o registro
 * vinculado finalizado. `linkedRecord` é a versão vigente do prontuário.
 */
export function validateTransition(doc: PatientDocument, to: DocumentStatus, linkedRecord?: ClinicalRecord) {
  if (!canTransitionDocument(doc.status, to)) {
    throw new ValidationError(
      `Não é possível mudar o documento de "${DOCUMENT_STATUS_LABELS[doc.status]}" para "${DOCUMENT_STATUS_LABELS[to]}".`
    )
  }
  if (to === "issued" && doc.classification === "clinical" && linkedRecord?.status !== "finalized") {
    throw new ValidationError("O registro clínico vinculado precisa estar finalizado para emitir o documento.")
  }
}

/** RN-DOC-004/005: liberação explícita e individual. */
export function buildRelease(
  doc: PatientDocument,
  link: Pick<PatientGuardianLink, "canReceiveDocuments"> | undefined,
  guardianId: string,
  id: string,
  user: User,
  at: string
): DocumentRelease {
  if (doc.status !== "issued") throw new ValidationError("Somente documentos emitidos podem ser liberados.")
  if (!link) throw new ValidationError("O responsável não está vinculado a este paciente.")
  if (!link.canReceiveDocuments) throw new ValidationError("Este responsável não está autorizado a receber documentos.")
  if (activeReleases(doc).some((r) => r.guardianId === guardianId)) {
    throw new ValidationError("Este documento já está liberado para o responsável.")
  }
  return { id, guardianId, releasedBy: user.id, releasedByName: user.name, releasedAt: at }
}

export function revokeRelease(doc: PatientDocument, releaseId: string, reason: string, user: User, at: string): PatientDocument {
  const release = doc.releases.find((r) => r.id === releaseId)
  if (!release) throw new ValidationError("Liberação não encontrada.")
  if (release.revokedAt) throw new ValidationError("Esta liberação já foi revogada.")
  const clean = reason.trim()
  if (clean.length < 5) throw new ValidationError("Informe o motivo da revogação (mínimo 5 caracteres).")
  return {
    ...doc,
    updatedAt: at,
    releases: doc.releases.map((r) => (r.id === releaseId ? { ...r, revokedAt: at, revokedBy: user.id, revokeReason: clean } : r)),
  }
}

/** RN-DOC-003/006: arquivar ou retificar o registro vinculado revoga o que estiver liberado. */
export function revokeAllReleases(doc: PatientDocument, reason: string, actor: { id: string }, at: string): PatientDocument {
  if (!activeReleases(doc).length) return doc
  return {
    ...doc,
    updatedAt: at,
    releases: doc.releases.map((r) => (r.revokedAt ? r : { ...r, revokedAt: at, revokedBy: actor.id, revokeReason: reason })),
  }
}

export function assertDocumentWrite(access: DocumentAccess) {
  if (!access.write) throw new ForbiddenError("Seu perfil não pode alterar documentos desta classificação.")
}
