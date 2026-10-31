import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors"
import { currentFinalized } from "@/domain/clinical-record"
import {
  activeReleases,
  assertDocumentWrite,
  buildRelease,
  documentAccess,
  revokeAllReleases,
  revokeRelease,
  validateTransition,
  type DocumentAccess,
} from "@/domain/documents"
import { can } from "@/domain/permissions"
import {
  documentSchema,
  reasonSchema,
  releaseSchema,
  type DocumentInput,
  type ReasonInput,
  type ReleaseInput,
} from "@/domain/schemas"
import type { ClinicalRecord, DocumentClassification, DocumentStatus, PatientDocument, User } from "@/domain/types"
import { commit, getDB, simulateLatency, uid } from "@/shared/lib/demo-db"

import { actor, audit, auditRead, now, ownPatientIds, parse } from "./demo-context"

// RN-DOC-001: o acesso é decidido pela classificação do documento, não só por `documents:read`.

function requireDocuments(user: User) {
  if (!can(user, "documents:read")) throw new ForbiddenError("Seu perfil não tem acesso a documentos.")
}

function accessFor(user: User, classification: DocumentClassification, patientId: string): DocumentAccess {
  return documentAccess(user, classification, ownPatientIds(user).has(patientId))
}

function findDocument(id: string): PatientDocument {
  const doc = getDB().documents.find((d) => d.id === id)
  if (!doc) throw new NotFoundError("Documento não encontrado.")
  return doc
}

function putDocument(next: PatientDocument) {
  const db = getDB()
  db.documents[db.documents.findIndex((d) => d.id === next.id)] = next
}

function readable(user: User, id: string) {
  requireDocuments(user)
  const doc = findDocument(id)
  const access = accessFor(user, doc.classification, doc.patientId)
  if (!access.read) throw new ForbiddenError("Você não tem acesso a este documento.")
  return { doc, access }
}

function writable(user: User, id: string) {
  const { doc, access } = readable(user, id)
  assertDocumentWrite(access)
  return doc
}

function patientName(id: string) {
  return getDB().patients.find((p) => p.id === id)?.fullName ?? "paciente"
}

function linkedRecord(doc: Pick<PatientDocument, "clinicalRecordId">) {
  return doc.clinicalRecordId ? currentFinalized(getDB().clinicalRecords, doc.clinicalRecordId) : undefined
}

/** RN-DOC-008: documento clínico só nasce e é liberado pelo autor do registro vinculado (que ainda tem acesso de escrita). */
function assertRecordAuthor(user: User, root: ClinicalRecord | undefined, action: "criar" | "liberar") {
  if (root?.authorId !== user.id) {
    throw new ForbiddenError(`Somente o autor do registro clínico vinculado pode ${action} este documento clínico.`)
  }
}

/**
 * RN-DOC-009: sem vínculo (ou sem `canReceiveDocuments`) não pode haver liberação ativa.
 * Revoga todas as liberações ativas do responsável nos documentos do paciente, mantendo o histórico.
 */
export function revokeGuardianReleases(patientId: string, guardianId: string, reason: string, user: User, at: string) {
  const db = getDB()
  db.documents = db.documents.map((doc) => {
    if (doc.patientId !== patientId) return doc
    const next = activeReleases(doc)
      .filter((r) => r.guardianId === guardianId)
      .reduce((acc, r) => revokeRelease(acc, r.id, reason, user, at), doc)
    if (next !== doc) audit(user, "status_change", "document_release", doc.id, "Revogou liberação de documento por mudança no vínculo do responsável")
    return next
  })
}

export const documentsApi = {
  async list(filters: { patientId?: string; classification?: DocumentClassification | "all"; status?: DocumentStatus | "all" } = {}) {
    await simulateLatency()
    const user = actor()
    requireDocuments(user)
    const patients = new Map(getDB().patients.map((p) => [p.id, p]))
    const docs = getDB()
      .documents.filter((d) => accessFor(user, d.classification, d.patientId).read)
      .filter((d) => !filters.patientId || d.patientId === filters.patientId)
      .filter((d) => !filters.classification || filters.classification === "all" || d.classification === filters.classification)
      .filter((d) => !filters.status || filters.status === "all" || d.status === filters.status)
    for (const doc of docs) {
      if (doc.classification === "clinical") auditRead(user, "document", doc.id, "Consultou lista de documentos clínicos")
    }
    return docs
      .map((doc) => ({
        doc,
        patientName: patients.get(doc.patientId)?.fullName ?? "—",
        canWrite: accessFor(user, doc.classification, doc.patientId).write,
      }))
      .sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt))
  },

  /** `guardianNames` cobre quem tem liberação mesmo após o desvínculo, para a revogação continuar possível. */
  async get(id: string) {
    await simulateLatency()
    const user = actor()
    const { doc, access } = readable(user, id)
    if (doc.classification === "clinical") auditRead(user, "document", id, "Consultou documento clínico")
    const guardians = new Map(getDB().guardians.map((g) => [g.id, g.fullName]))
    const guardianNames: Record<string, string> = {}
    for (const r of doc.releases) guardianNames[r.guardianId] = guardians.get(r.guardianId) ?? "Responsável"
    return { doc, canWrite: access.write, patientName: patientName(doc.patientId), guardianNames }
  },

  async create(input: DocumentInput) {
    await simulateLatency()
    const user = actor()
    requireDocuments(user)
    const data = parse<DocumentInput>(documentSchema, input)
    const db = getDB()
    if (!db.patients.some((p) => p.id === data.patientId)) throw new NotFoundError("Paciente não encontrado.")
    assertDocumentWrite(accessFor(user, data.classification, data.patientId))
    if (data.classification === "clinical") {
      // RN-DOC-002: o conteúdo clínico fica no prontuário; aqui só a referência.
      const root = db.clinicalRecords.find((r) => r.id === data.clinicalRecordId && r.rootId === r.id)
      if (!root || root.patientId !== data.patientId || root.kind !== "document") {
        throw new ValidationError("Vincule um documento clínico do prontuário deste paciente.")
      }
      assertRecordAuthor(user, root, "criar")
    } else if (data.clinicalRecordId) {
      throw new ValidationError("Somente documentos clínicos podem referenciar o prontuário.")
    }
    const at = now()
    const doc: PatientDocument = {
      id: uid("dc"),
      patientId: data.patientId,
      title: data.title,
      type: data.type,
      classification: data.classification,
      status: "draft",
      clinicalRecordId: data.clinicalRecordId || undefined,
      notes: data.notes || undefined,
      releases: [],
      createdBy: user.id,
      createdByName: user.name,
      createdAt: at,
      updatedAt: at,
    }
    db.documents.push(doc)
    audit(user, "create", "document", doc.id, `Criou ${doc.classification === "clinical" ? "documento clínico" : "documento"}`)
    commit()
    return doc
  },

  /** RN-DOC-003: só rascunho é editável; classificação e vínculo não mudam. */
  async update(id: string, input: DocumentInput) {
    await simulateLatency()
    const user = actor()
    const doc = writable(user, id)
    if (doc.status !== "draft") throw new ValidationError("Somente documentos em rascunho podem ser editados.")
    const data = parse<DocumentInput>(documentSchema, { ...input, patientId: doc.patientId, classification: doc.classification })
    const next: PatientDocument = { ...doc, title: data.title, type: data.type, notes: data.notes || undefined, updatedAt: now() }
    putDocument(next)
    audit(user, "update", "document", id, `Editou ${doc.classification === "clinical" ? "documento clínico" : "documento"}`)
    commit()
    return next
  },

  async setStatus(id: string, to: DocumentStatus) {
    await simulateLatency()
    const user = actor()
    const doc = writable(user, id)
    validateTransition(doc, to, linkedRecord(doc))
    const at = now()
    let next: PatientDocument = { ...doc, status: to, updatedAt: at }
    if (to === "issued") next.issuedAt = at
    if (to === "archived") {
      next.archivedAt = at
      next = revokeAllReleases(next, "Documento arquivado", user, at)
    }
    putDocument(next)
    audit(user, "status_change", "document", id, `${to === "issued" ? "Emitiu" : "Arquivou"} ${doc.classification === "clinical" ? "documento clínico" : "documento"}`)
    commit()
    return next
  },

  /** RN-DOC-004/005: liberação explícita e individual, só para responsável autorizado. */
  async release(id: string, input: ReleaseInput) {
    await simulateLatency()
    const user = actor()
    const doc = writable(user, id)
    const data = parse<ReleaseInput>(releaseSchema, input)
    if (doc.classification === "clinical") {
      assertRecordAuthor(user, getDB().clinicalRecords.find((r) => r.id === doc.clinicalRecordId), "liberar")
      if (linkedRecord(doc)?.status !== "finalized") {
        throw new ValidationError("O registro clínico vinculado precisa estar finalizado para liberar o documento.")
      }
    }
    const link = getDB().links.find((l) => l.patientId === doc.patientId && l.guardianId === data.guardianId)
    const release = buildRelease(doc, link, data.guardianId, uid("rl"), user, now())
    putDocument({ ...doc, releases: [...doc.releases, release], updatedAt: release.releasedAt })
    audit(user, "create", "document_release", id, `Liberou ${doc.classification === "clinical" ? "documento clínico" : "documento"} para um responsável`)
    commit()
    return release
  },

  async revokeRelease(id: string, releaseId: string, input: ReasonInput) {
    await simulateLatency()
    const user = actor()
    const doc = writable(user, id)
    const data = parse<ReasonInput>(reasonSchema, input)
    putDocument(revokeRelease(doc, releaseId, data.reason, user, now()))
    audit(user, "status_change", "document_release", id, `Revogou liberação de ${doc.classification === "clinical" ? "documento clínico" : "documento"}`)
    commit()
  },
}

export type DocumentRow = Awaited<ReturnType<typeof documentsApi.list>>[number]
