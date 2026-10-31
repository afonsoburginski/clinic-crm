import type {
  AddDocumentReleaseCommand,
  ChangeDocumentStatusCommand,
  CreateDocumentCommand,
  DocumentAudit,
  DocumentPayload,
  DocumentQueryRepository,
  DocumentRecord,
  DocumentRepository,
  GetDocumentQuery,
  ListDocumentsQuery,
  RevokeDocumentReleaseCommand,
  UpdateDocumentCommand,
} from "@/application/ports/documents"
import type { Actor, PatientAccessPolicy } from "@/application/ports/patient-access"
import type { PermissionPolicy } from "@/application/ports/permissions"
import {
  assertAuthenticated,
  fieldsOf,
  isRecord,
  listOf,
  patientIdOf,
  professionalScopeOf,
  textLength,
} from "@/application/use-cases/clinical-payload"
import { withLegacyCreationDefaults } from "@/application/use-cases/legacy-defaults"

const CLINICAL = "clinical"
const DRAFT = "draft"
const ISSUED = "issued"
const ARCHIVED = "archived"
const FINALIZED = "finalized"
const CLASSIFICATIONS: readonly unknown[] = [CLINICAL, "administrative", "financial"]
const READ_PERMISSIONS: ReadonlyMap<unknown, string> = new Map([
  [CLINICAL, "clinical:read"],
  ["financial", "finance:read"],
  ["administrative", "patients:read"],
])
const MIN_REVOKE_REASON_LENGTH = 5

export interface DocumentRuntime {
  now(): Date
  newId(): string
}

const systemRuntime: DocumentRuntime = { now: () => new Date(), newId: () => crypto.randomUUID() }

function auditEntry(action: DocumentAudit["action"]): DocumentAudit {
  return { action, summary: "Alterou document" }
}

/** Create and update rules: a patient, a title and a known classification. */
function validDocument(body: unknown): DocumentPayload {
  if (!isRecord(body) || !body.patientId || !body.title || !CLASSIFICATIONS.includes(body.classification)) {
    throw new Error("validation")
  }
  return body
}

/** The permission that gates reading a document depends on its classification; an unknown one is unreadable. */
function canRead(permissions: PermissionPolicy, actor: Actor, document: DocumentRecord): boolean {
  const permission = READ_PERMISSIONS.get(document.classification)
  return permission !== undefined && permissions.has(actor, permission)
}

/** Set only by the dedicated actions (status change, release add/revoke); a generic update can never carry them. */
const ACTION_FIELDS = ["status", "releases"] as const

/** Only issuing a draft and archiving an issued document are guarded; any other status is accepted. */
function assertTransition(current: DocumentRecord, status: unknown): void {
  if ((status === ISSUED && current.status !== DRAFT) || (status === ARCHIVED && current.status !== ISSUED)) {
    throw new Error("conflict")
  }
}

async function load(repository: DocumentQueryRepository, clinicId: string, id: string): Promise<DocumentRecord> {
  const document = await repository.findById(clinicId, id)
  if (!document) throw new Error("not_found")
  return document
}

export function createDocumentQueries(
  repository: DocumentQueryRepository,
  access: PatientAccessPolicy,
  permissions: PermissionPolicy,
) {
  return {
    /** Professionals only see their linked patients' documents; everyone only sees classifications they may read. */
    async listDocuments(query: ListDocumentsQuery): Promise<DocumentRecord[]> {
      const documents = await repository.find({
        clinicId: query.clinicId,
        filters: query.filters,
        professionalId: professionalScopeOf(query.actor),
      })
      return documents.filter((document) => canRead(permissions, query.actor, document))
    },
    /** The classification permission gates the read, as in the list; a clinical document also needs access to its patient. */
    async getDocument(query: GetDocumentQuery): Promise<DocumentRecord> {
      const document = await load(repository, query.clinicId, query.id)
      if (!canRead(permissions, query.actor, document)) throw new Error("forbidden")
      if (document.classification === CLINICAL) await access.assertAccess(patientIdOf(document), query.actor)
      return document
    },
  }
}

export function createDocumentCommands(
  repository: DocumentRepository,
  access: PatientAccessPolicy,
  runtime: DocumentRuntime = systemRuntime,
) {
  async function save(
    clinicId: string,
    actorId: string,
    id: string,
    decide: (current: DocumentRecord) => DocumentPayload,
  ): Promise<DocumentRecord> {
    const result = await repository.change({ clinicId, id, actorId, change: decide, audit: auditEntry("update") })
    if (result.outcome === "not_found") throw new Error("not_found")
    return result.record
  }

  /** Runs one action: `decide` sees the locked document and returns the changed fields, which must leave it valid. */
  function act(
    command: { clinicId: string; actor: Actor; id: string },
    decide: (current: DocumentRecord, at: string) => DocumentPayload,
  ): Promise<DocumentRecord> {
    return save(command.clinicId, command.actor.userId, command.id, (locked) => {
      const changes = decide(locked, runtime.now().toISOString())
      validDocument({ ...locked, ...changes })
      return changes
    })
  }

  /** Loads the document of an action, checking access when it is clinical. */
  async function loadForAction(command: { clinicId: string; actor: Actor; id: string }): Promise<DocumentRecord> {
    assertAuthenticated(command.actor)
    const current = await load(repository, command.clinicId, command.id)
    if (current.classification === CLINICAL) await access.assertAccess(patientIdOf(current), command.actor)
    return current
  }

  return {
    async createDocument(command: CreateDocumentCommand): Promise<DocumentRecord> {
      if (fieldsOf(command.body).classification === CLINICAL) {
        await access.assertAccess(patientIdOf(command.body), command.actor)
      }
      const payload = validDocument(command.body)
      return repository.insert({
        clinicId: command.clinicId,
        actorId: command.actor.userId,
        payload: withLegacyCreationDefaults(payload, command.actor.userId),
        audit: auditEntry("create"),
      })
    },
    /**
     * `status` and `releases` belong to the dedicated actions and are refused. A clinical document needs
     * access to its patient, and so does a patch that makes the document clinical or moves it to another patient.
     */
    async updateDocument(command: UpdateDocumentCommand): Promise<DocumentRecord> {
      const patch = validDocument(command.body)
      if (ACTION_FIELDS.some((field) => field in patch)) throw new Error("validation")
      await loadForAction(command)
      if (patch.classification === CLINICAL) await access.assertAccess(patientIdOf(patch), command.actor)
      return save(command.clinicId, command.actor.userId, command.id, () => patch)
    },
    /**
     * Issuing needs a draft and, for a clinical document, a finalized record of the same patient;
     * archiving needs an issued document and revokes its active releases.
     */
    async changeStatus(command: ChangeDocumentStatusCommand): Promise<DocumentRecord> {
      const current = await loadForAction(command)
      const { status } = fieldsOf(command.body)
      assertTransition(current, status)
      const needsRecord = status === ISSUED && current.classification === CLINICAL
      const recordId = current.clinicalRecordId
      const record =
        needsRecord && typeof recordId === "string"
          ? await repository.findClinicalRecord(command.clinicId, recordId)
          : undefined
      if (needsRecord && !record) throw new Error("not_found")
      return act(command, (locked, at) => {
        assertTransition(locked, status)
        if (needsRecord && (record?.patientId !== locked.patientId || record?.status !== FINALIZED)) {
          throw new Error("conflict")
        }
        if (status !== ARCHIVED) return { status }
        const releases = listOf(locked.releases).map((release) =>
          isRecord(release) && release.active
            ? { ...release, active: false, revokedAt: at, revokeReason: "Documento arquivado", revokedBy: command.actor.userId }
            : release,
        )
        return { status, releases }
      })
    },
    /** Releases an issued document to a guardian who may receive documents, once per guardian. */
    async addRelease(command: AddDocumentReleaseCommand): Promise<DocumentRecord> {
      const current = await loadForAction(command)
      const { guardianId } = fieldsOf(command.body)
      if (current.status !== ISSUED || typeof guardianId !== "string" || !guardianId) throw new Error("conflict")
      const patientId = patientIdOf(current)
      const allowed =
        patientId !== undefined &&
        (await repository.guardianReceivesDocuments({ clinicId: command.clinicId, patientId, guardianId }))
      if (!allowed) throw new Error("forbidden")
      return act(command, (locked, at) => {
        const releases = listOf(locked.releases)
        const alreadyReleased = releases.some((release) => isRecord(release) && release.guardianId === guardianId && release.active)
        if (locked.status !== ISSUED || alreadyReleased) throw new Error("conflict")
        const release = { guardianId, id: runtime.newId(), active: true, createdBy: command.actor.userId, createdAt: at }
        return { releases: [...releases, release] }
      })
    },
    /** The reason is stored as `reason` (archiving uses `revokeReason`). */
    async revokeRelease(command: RevokeDocumentReleaseCommand): Promise<DocumentRecord> {
      await loadForAction(command)
      const { reason } = fieldsOf(command.body)
      if (textLength(reason) < MIN_REVOKE_REASON_LENGTH) throw new Error("validation")
      return act(command, (locked, at) => {
        const releases = listOf(locked.releases).map((release) =>
          isRecord(release) && release.id === command.releaseId && release.active
            ? { ...release, active: false, revokedAt: at, revokedBy: command.actor.userId, reason }
            : release,
        )
        if (releases.every((release) => isRecord(release) && release.active)) throw new Error("not_found")
        return { releases }
      })
    },
  }
}

export function createDocumentUseCases(
  repository: DocumentRepository,
  access: PatientAccessPolicy,
  permissions: PermissionPolicy,
  runtime: DocumentRuntime = systemRuntime,
) {
  return {
    queries: createDocumentQueries(repository, access, permissions),
    commands: createDocumentCommands(repository, access, runtime),
  }
}

export type DocumentUseCases = ReturnType<typeof createDocumentUseCases>
