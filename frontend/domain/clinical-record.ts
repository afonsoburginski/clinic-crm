import { ForbiddenError, ValidationError } from "./errors"
import { can } from "./permissions"
import type {
  ClinicalRecord,
  ClinicalRecordAction,
  ClinicalRecordEvent,
  ClinicalRecordKind,
  ClinicalRecordStatus,
  User,
} from "./types"

export const RECORD_KIND_LABELS: Record<ClinicalRecordKind, string> = {
  anamnesis: "Anamnese",
  evolution: "Evolução",
  document: "Documento clínico",
}

export const RECORD_STATUS_LABELS: Record<ClinicalRecordStatus, string> = {
  draft: "Rascunho",
  finalized: "Finalizado",
  rectified: "Retificado",
}

export const MIN_CONTENT_TO_FINALIZE = 20
export const MIN_RECTIFICATION_REASON = 10

/** RN-PRN-001/002: permissão clínica somada ao vínculo com o paciente. */
export function canReadClinical(user: User | null | undefined, patientIsOwn: boolean) {
  return can(user, "clinical:read") && patientIsOwn
}

export function canWriteClinical(user: User | null | undefined, patientIsOwn: boolean) {
  return can(user, "clinical:write") && patientIsOwn
}

function event(user: User, action: ClinicalRecordAction, at: string): ClinicalRecordEvent {
  return { at, actorId: user.id, actorName: user.name, action }
}

/** RN-PRN-003 */
function assertAuthor(user: User, record: ClinicalRecord) {
  if (record.authorId !== user.id) throw new ForbiddenError("Somente o autor do registro pode alterá-lo ou retificá-lo.")
}

export interface DraftInput {
  kind: ClinicalRecordKind
  title: string
  content: string
  appointmentId?: string
}

export function newDraft(input: DraftInput & { id: string; patientId: string }, user: User, at: string): ClinicalRecord {
  if (!user.professionalId) throw new ForbiddenError("Somente profissionais de saúde registram prontuário.")
  return {
    id: input.id,
    rootId: input.id,
    version: 1,
    patientId: input.patientId,
    kind: input.kind,
    title: input.title,
    content: input.content,
    appointmentId: input.appointmentId,
    status: "draft",
    authorId: user.id,
    authorName: user.name,
    professionalId: user.professionalId,
    createdAt: at,
    updatedAt: at,
    history: [event(user, "created", at)],
  }
}

/** RN-PRN-003/005: só o autor edita, e só enquanto for rascunho. O tipo não muda. */
export function editDraft(
  record: ClinicalRecord,
  patch: Pick<DraftInput, "title" | "content" | "appointmentId">,
  user: User,
  at: string
): ClinicalRecord {
  assertAuthor(user, record)
  if (record.status !== "draft") {
    throw new ValidationError("Registros finalizados não podem ser editados. Use a retificação.")
  }
  return {
    ...record,
    title: patch.title,
    content: patch.content,
    appointmentId: patch.appointmentId,
    updatedAt: at,
    history: [...record.history, event(user, "updated", at)],
  }
}

/**
 * RN-PRN-004/007. Finaliza o rascunho; se ele for uma retificação, devolve
 * também a versão anterior já marcada como `retificado` (sem tocar no conteúdo).
 */
export function finalizeDraft(
  record: ClinicalRecord,
  user: User,
  at: string,
  original?: ClinicalRecord
): { record: ClinicalRecord; superseded?: ClinicalRecord } {
  assertAuthor(user, record)
  if (record.status !== "draft") throw new ValidationError("Somente rascunhos podem ser finalizados.")
  if (!record.title.trim()) throw new ValidationError("Informe o título para finalizar.")
  if (record.content.trim().length < MIN_CONTENT_TO_FINALIZE) {
    throw new ValidationError(`O conteúdo precisa ter ao menos ${MIN_CONTENT_TO_FINALIZE} caracteres para finalizar.`)
  }
  const finalized: ClinicalRecord = {
    ...record,
    status: "finalized",
    finalizedAt: at,
    updatedAt: at,
    history: [...record.history, event(user, "finalized", at)],
  }
  if (!record.rectifiesId) return { record: finalized }

  if (!original || original.id !== record.rectifiesId) throw new ValidationError("Versão original não encontrada.")
  if (original.status !== "finalized") throw new ValidationError("A versão original já foi retificada.")
  const superseded: ClinicalRecord = {
    ...original,
    status: "rectified",
    supersededById: record.id,
    updatedAt: at,
    history: [...original.history, event(user, "rectified", at)],
  }
  return { record: finalized, superseded }
}

/** RN-PRN-006: cria o rascunho da nova versão; a original só muda ao finalizá-lo. */
export function startRectification(
  original: ClinicalRecord,
  all: ClinicalRecord[],
  input: { id: string; reason: string },
  user: User,
  at: string
): ClinicalRecord {
  assertAuthor(user, original)
  if (original.status !== "finalized") {
    throw new ValidationError("Somente registros finalizados e vigentes podem ser retificados.")
  }
  const reason = input.reason.trim()
  if (reason.length < MIN_RECTIFICATION_REASON) {
    throw new ValidationError(`Descreva o motivo da retificação (mínimo ${MIN_RECTIFICATION_REASON} caracteres).`)
  }
  if (all.some((r) => r.rootId === original.rootId && r.status === "draft" && r.rectifiesId)) {
    throw new ValidationError("Já existe uma retificação em rascunho para este registro.")
  }
  return {
    ...original,
    id: input.id,
    version: original.version + 1,
    status: "draft",
    rectifiesId: original.id,
    rectificationReason: reason,
    supersededById: undefined,
    authorId: user.id,
    authorName: user.name,
    createdAt: at,
    updatedAt: at,
    finalizedAt: undefined,
    history: [event(user, "rectification_started", at)],
  }
}

/** Versões de um mesmo registro, da mais antiga para a mais recente. */
export function versionChain(records: ClinicalRecord[], rootId: string) {
  return records.filter((r) => r.rootId === rootId).sort((a, b) => a.version - b.version)
}

/** Versão vigente (finalizada) de um registro, se houver. */
export function currentFinalized(records: ClinicalRecord[], rootId: string) {
  return versionChain(records, rootId).find((r) => r.status === "finalized")
}
