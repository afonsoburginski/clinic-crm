import { currentFinalized } from "@/domain/clinical-record"
import { assertDocumentWrite, buildRelease, documentAccess, revokeRelease, validateTransition } from "@/domain/documents"
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors"
import {
  documentSchema,
  reasonSchema,
  releaseSchema,
  type DocumentInput,
  type ReasonInput,
  type ReleaseInput,
} from "@/domain/schemas"
import type { ClinicalRecord, DocumentClassification, DocumentStatus, PatientDocument, User } from "@/domain/types"

import { toGuardian, toGuardianLink, type Row } from "./backend-mappers"
import { clinicalRecordsApi } from "./clinical-api"
import { toPatientDocument } from "./document-mappers"
import { currentUser, items, now, parse, seg, whenForbidden } from "./helpers"
import { http } from "./http-client"
import { loadPatients } from "./patient-directory"

// RN-DOC-001: a API decide o acesso pela classificação do documento (e pelo vínculo clínico). Aqui rodam
// as regras de domínio que dão mensagem clara antes da chamada e a junção de nomes (paciente, responsável).

const NO_ACCESS = "Seu perfil não tem acesso a documentos."
const NO_DOCUMENT_ACCESS = "Você não tem acesso a este documento."

const documentErrors = { 403: NO_DOCUMENT_ACCESS, 404: "Documento não encontrado." }

async function fetchDocument(id: string) {
  return toPatientDocument(await http.get<Row>(`/documents/${seg(id)}`, { errors: documentErrors }))
}

/** `patientIsOwn` vem da lista de pacientes que a API devolve ao perfil (só os vinculados, no caso do profissional). */
async function accessFor(user: User, classification: DocumentClassification, patientId: string) {
  const patients = await loadPatients().catch(whenForbidden(null))
  return documentAccess(user, classification, patients ? patients.some((p) => p.id === patientId) : true)
}

async function writableAccess(user: User, doc: PatientDocument) {
  assertDocumentWrite(await accessFor(user, doc.classification, doc.patientId))
}

/** Versão vigente (finalizada) do registro clínico vinculado, se o perfil puder lê-lo. */
async function linkedRecord(doc: Pick<PatientDocument, "clinicalRecordId">): Promise<ClinicalRecord | undefined> {
  if (!doc.clinicalRecordId) return undefined
  const chain = await clinicalRecordsApi.versions(doc.clinicalRecordId).catch(whenForbidden([] as ClinicalRecord[]))
  return currentFinalized(chain, doc.clinicalRecordId)
}

/** RN-DOC-008: documento clínico só nasce e é liberado pelo autor do registro vinculado. */
function assertRecordAuthor(user: User, root: ClinicalRecord | undefined, action: "criar" | "liberar") {
  if (root?.authorId !== user.id) {
    throw new ForbiddenError(`Somente o autor do registro clínico vinculado pode ${action} este documento clínico.`)
  }
}

/** A API não guarda o instante de emissão/arquivamento: o carimbo vai no documento antes da mudança de situação. */
function stamp(doc: PatientDocument, patch: Record<string, string>) {
  return http.patch(`/documents/${seg(doc.id)}`, {
    body: { patientId: doc.patientId, title: doc.title, classification: doc.classification, ...patch },
    errors: documentErrors,
  })
}

export const documentsApi = {
  async list(filters: { patientId?: string; classification?: DocumentClassification | "all"; status?: DocumentStatus | "all" } = {}) {
    const user = currentUser()
    const [body, patients] = await Promise.all([
      http.get<{ items?: Row[] }>("/documents", {
        query: { patientId: filters.patientId, status: filters.status && filters.status !== "all" ? filters.status : undefined },
        errors: { 403: NO_ACCESS },
      }),
      loadPatients().catch(whenForbidden([])),
    ])
    const names = new Map(patients.map((p) => [p.id, p.fullName]))
    return (body.items ?? [])
      .map((row) => toPatientDocument(row))
      .filter((d) => !filters.classification || filters.classification === "all" || d.classification === filters.classification)
      .map((doc) => ({
        doc,
        patientName: names.get(doc.patientId) ?? "—",
        canWrite: documentAccess(user, doc.classification, patients.length ? names.has(doc.patientId) : true).write,
      }))
      .sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt))
  },

  /** `guardianNames` cobre quem tem liberação mesmo após o desvínculo, para a revogação continuar possível. */
  async get(id: string) {
    const user = currentUser()
    const doc = await fetchDocument(id)
    const [patients, guardianRows] = await Promise.all([
      loadPatients().catch(whenForbidden([])),
      items("/guardians").catch(whenForbidden([] as Row[])),
    ])
    const guardians = new Map(guardianRows.map(toGuardian).map((g) => [g.id, g.fullName]))
    const guardianNames: Record<string, string> = {}
    for (const r of doc.releases) guardianNames[r.guardianId] = guardians.get(r.guardianId) ?? "Responsável"
    const own = patients.length ? patients.some((p) => p.id === doc.patientId) : true
    return {
      doc,
      canWrite: documentAccess(user, doc.classification, own).write,
      patientName: patients.find((p) => p.id === doc.patientId)?.fullName ?? "paciente",
      guardianNames,
    }
  },

  async create(input: DocumentInput) {
    const user = currentUser()
    const data = parse<DocumentInput>(documentSchema, input)
    const patients = await loadPatients().catch(whenForbidden(null))
    if (patients && !patients.some((p) => p.id === data.patientId)) throw new NotFoundError("Paciente não encontrado.")
    assertDocumentWrite(await accessFor(user, data.classification, data.patientId))
    if (data.classification === "clinical") {
      // RN-DOC-002: o conteúdo clínico fica no prontuário; aqui só a referência.
      const record = data.clinicalRecordId ? await clinicalRecordsApi.get(data.clinicalRecordId).catch(whenForbidden(undefined)) : undefined
      if (!record || record.id !== record.rootId || record.patientId !== data.patientId || record.kind !== "document") {
        throw new ValidationError("Vincule um documento clínico do prontuário deste paciente.")
      }
      assertRecordAuthor(user, record, "criar")
    } else if (data.clinicalRecordId) {
      throw new ValidationError("Somente documentos clínicos podem referenciar o prontuário.")
    }
    const at = now()
    const created = await http.post<Row>("/documents", {
      body: {
        patientId: data.patientId,
        title: data.title,
        type: data.type,
        classification: data.classification,
        clinicalRecordId: data.clinicalRecordId || undefined,
        notes: data.notes || undefined,
        createdByName: user.name,
        createdAt: at,
        updatedAt: at,
      },
      errors: { 403: NO_DOCUMENT_ACCESS },
    })
    return toPatientDocument(created)
  },

  /** RN-DOC-003: só rascunho é editável; classificação e vínculo não mudam. */
  async update(id: string, input: DocumentInput) {
    const user = currentUser()
    const doc = await fetchDocument(id)
    await writableAccess(user, doc)
    if (doc.status !== "draft") throw new ValidationError("Somente documentos em rascunho podem ser editados.")
    const data = parse<DocumentInput>(documentSchema, { ...input, patientId: doc.patientId, classification: doc.classification })
    const saved = await http.patch<Row>(`/documents/${seg(id)}`, {
      body: {
        patientId: doc.patientId,
        classification: doc.classification,
        title: data.title,
        type: data.type,
        notes: data.notes || null,
        updatedAt: now(),
      },
      errors: documentErrors,
    })
    return toPatientDocument(saved)
  },

  async setStatus(id: string, to: DocumentStatus) {
    const user = currentUser()
    const doc = await fetchDocument(id)
    await writableAccess(user, doc)
    validateTransition(doc, to, doc.classification === "clinical" ? await linkedRecord(doc) : undefined)
    const at = now()
    await stamp(doc, to === "issued" ? { issuedAt: at, updatedAt: at } : { archivedAt: at, updatedAt: at })
    return toPatientDocument(
      await http.post<Row>(`/documents/${seg(id)}/status`, {
        body: { status: to },
        errors: { ...documentErrors, 409: "Não é possível mudar a situação do documento: o registro clínico vinculado precisa estar finalizado." },
      })
    )
  },

  /** RN-DOC-004/005: liberação explícita e individual, só para responsável autorizado. */
  async release(id: string, input: ReleaseInput) {
    const user = currentUser()
    const doc = await fetchDocument(id)
    await writableAccess(user, doc)
    const data = parse<ReleaseInput>(releaseSchema, input)
    if (doc.classification === "clinical") {
      const record = doc.clinicalRecordId ? await clinicalRecordsApi.get(doc.clinicalRecordId).catch(whenForbidden(undefined)) : undefined
      assertRecordAuthor(user, record, "liberar")
      if ((await linkedRecord(doc))?.status !== "finalized") {
        throw new ValidationError("O registro clínico vinculado precisa estar finalizado para liberar o documento.")
      }
    }
    const links = await items("/patient-guardians", { patientId: doc.patientId }).catch(whenForbidden(null))
    const link = links?.map(toGuardianLink).find((l) => l.guardianId === data.guardianId)
    if (links) buildRelease(doc, link, data.guardianId, "pending", user, now())
    const released = toPatientDocument(
      await http.post<Row>(`/documents/${seg(id)}/releases`, {
        body: { guardianId: data.guardianId },
        errors: { ...documentErrors, 403: "Este responsável não está autorizado a receber documentos.", 409: "Este documento já está liberado para o responsável." },
      })
    )
    const release = released.releases.filter((r) => r.guardianId === data.guardianId && !r.revokedAt).at(-1)
    if (!release) throw new ValidationError("Não foi possível confirmar a liberação do documento.")
    return release
  },

  async revokeRelease(id: string, releaseId: string, input: ReasonInput) {
    const user = currentUser()
    const doc = await fetchDocument(id)
    await writableAccess(user, doc)
    const data = parse<ReasonInput>(reasonSchema, input)
    revokeRelease(doc, releaseId, data.reason, user, now())
    await http.post(`/documents/${seg(id)}/releases/${seg(releaseId)}/revoke`, {
      body: { reason: data.reason },
      errors: { ...documentErrors, 404: "Liberação não encontrada." },
    })
  },
}

export type DocumentRow = Awaited<ReturnType<typeof documentsApi.list>>[number]
