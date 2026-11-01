import type {
  ClinicalRecord,
  ClinicalRecordAudit,
  ClinicalRecordPayload,
  ClinicalRecordQueryRepository,
  ClinicalRecordRepository,
  CreateClinicalRecordCommand,
  FinalizeClinicalRecordCommand,
  GetClinicalRecordQuery,
  ListClinicalPatientsQuery,
  ListClinicalRecordsQuery,
  ListClinicalRecordVersionsQuery,
  PatchClinicalRecordResult,
  RectifyClinicalRecordCommand,
  UpdateClinicalRecordCommand,
} from "@/application/ports/clinical-records"
import type { PatientAccessPolicy } from "@/application/ports/patient-access"
import {
  assertAuthenticated,
  assertLinkedProfessional,
  fieldsOf,
  isRecord,
  linkedProfessionalOf,
  omit,
  patientIdOf,
  professionalScopeOf,
  textLength,
  withCreationDefaults,
} from "@/application/use-cases/clinical-payload"
import { hasAdminRole } from "@/domain/permissions"

const DRAFT = "draft"
const FINALIZED = "finalized"
const RECORD_TYPES: readonly unknown[] = ["anamnesis", "progress", "clinical_document"]
const MIN_CONTENT_LENGTH = 20
const MIN_RECTIFICATION_REASON_LENGTH = 10

function auditEntry(action: ClinicalRecordAudit["action"]): ClinicalRecordAudit {
  return { action, summary: "Alterou clinical-record" }
}

/** Set only by the dedicated actions (`finalize`, `rectify`) or at creation; a client body can never carry them. */
const MANAGED_FIELDS = ["status", "createdBy", "parentId", "version", "rectificationReason"] as const

/** Create rules: a patient and a known record type. */
function validRecord(body: unknown): ClinicalRecordPayload {
  if (!isRecord(body) || !body.patientId || !RECORD_TYPES.includes(body.type)) throw new Error("validation")
  return body
}

/**
 * Update rules: only the fields present are validated, and the managed ones are refused. A stray `id`
 * is dropped: stored in the payload it would shadow the row id on read.
 */
function validPatch(body: unknown): ClinicalRecordPayload {
  if (!isRecord(body) || MANAGED_FIELDS.some((field) => field in body)) throw new Error("validation")
  if ("patientId" in body && (typeof body.patientId !== "string" || !body.patientId)) throw new Error("validation")
  if ("type" in body && !RECORD_TYPES.includes(body.type)) throw new Error("validation")
  return omit(body, ["id"])
}

/** A record can only be finalized with a title and enough content. */
function finalizable(record: ClinicalRecordPayload): boolean {
  return Boolean(record.title) && textLength(record.content) >= MIN_CONTENT_LENGTH
}

function versionOf(record: ClinicalRecord): number {
  return typeof record.version === "number" ? record.version : 1
}

/** Finalizing a rectification supersedes the finalized record it corrects. */
function supersededParentId(payload: ClinicalRecordPayload): string | undefined {
  return payload.status === FINALIZED && typeof payload.parentId === "string" && payload.parentId ? payload.parentId : undefined
}

function byVersion(a: ClinicalRecord, b: ClinicalRecord): number {
  const versionOrZero = (record: ClinicalRecord) => (typeof record.version === "number" ? record.version : 0)
  return versionOrZero(a) - versionOrZero(b)
}

/** Follows `parentId` upwards; a missing parent or a cycle makes the current record the root. */
function rootOf(item: ClinicalRecord, all: readonly ClinicalRecord[]): ClinicalRecord {
  const visited = new Set<ClinicalRecord>([item])
  let current = item
  while (current.parentId) {
    const parent = all.find((record) => record.id === current.parentId)
    if (!parent || visited.has(parent)) break
    visited.add(parent)
    current = parent
  }
  return current
}

/**
 * Version chain of `item`: its root first, then each record's rectifications depth-first,
 * ordered by version. Every stored record appears at most once, even if the data has a cycle.
 */
export function versionChain(item: ClinicalRecord, all: readonly ClinicalRecord[]): ClinicalRecord[] {
  const chain: ClinicalRecord[] = []
  const visited = new Set<ClinicalRecord>()
  const pending: ClinicalRecord[] = [rootOf(item, all)]
  for (let next = pending.pop(); next; next = pending.pop()) {
    if (visited.has(next)) continue
    visited.add(next)
    chain.push(next)
    const current = next
    const children = all.filter((record) => record.parentId === current.id).sort(byVersion)
    for (let i = children.length - 1; i >= 0; i--) pending.push(children[i])
  }
  return chain
}

async function load(repository: ClinicalRecordQueryRepository, clinicId: string, id: string): Promise<ClinicalRecord> {
  const record = await repository.findById(clinicId, id)
  if (!record) throw new Error("not_found")
  return record
}

export function createClinicalRecordQueries(repository: ClinicalRecordQueryRepository, access: PatientAccessPolicy) {
  return {
    async listRecords(query: ListClinicalRecordsQuery): Promise<ClinicalRecord[]> {
      return repository.find({
        clinicId: query.clinicId, filters: query.filters, professionalId: professionalScopeOf(query.actor),
      })
    },
    async listClinicalPatients(query: ListClinicalPatientsQuery): Promise<ClinicalRecord[]> {
      assertLinkedProfessional(query.actor)
      return repository.find({ clinicId: query.clinicId, filters: {}, professionalId: linkedProfessionalOf(query.actor) })
    },
    async getRecord(query: GetClinicalRecordQuery): Promise<ClinicalRecord> {
      const record = await load(repository, query.clinicId, query.id)
      await access.assertAccess(patientIdOf(record), query.actor)
      return record
    },
    async listVersions(query: ListClinicalRecordVersionsQuery): Promise<ClinicalRecord[]> {
      const record = await load(repository, query.clinicId, query.id)
      await access.assertAccess(patientIdOf(record), query.actor)
      assertLinkedProfessional(query.actor)
      const all = await repository.find({ clinicId: query.clinicId, filters: {}, professionalId: linkedProfessionalOf(query.actor) })
      return versionChain(record, all)
    },
  }
}

export function createClinicalRecordCommands(repository: ClinicalRecordRepository, access: PatientAccessPolicy) {
  /** Only drafts are editable; the repository re-checks the status under the row lock. */
  async function patchDraft(
    clinicId: string,
    actorId: string,
    id: string,
    patch: ClinicalRecordPayload,
    supersedesId?: string,
  ): Promise<ClinicalRecord> {
    const result: PatchClinicalRecordResult = await repository.patch({
      clinicId, id, actorId, patch, expectedStatus: DRAFT, supersedesId, audit: auditEntry("update"),
    })
    if (result.outcome === "not_found") throw new Error("not_found")
    if (result.outcome === "conflict") throw new Error("conflict")
    return result.record
  }

  return {
    /** Always opens a draft: managed fields sent by the client are ignored; `finalize` and `rectify` advance it. */
    async createRecord(command: CreateClinicalRecordCommand): Promise<ClinicalRecord> {
      await access.assertAccess(patientIdOf(command.body), command.actor)
      const payload = omit(validRecord(command.body), ["id", ...MANAGED_FIELDS])
      return repository.insert({
        clinicId: command.clinicId,
        actorId: command.actor.userId,
        payload: withCreationDefaults(payload, command.actor.userId),
        audit: auditEntry("create"),
      })
    },
    async updateRecord(command: UpdateClinicalRecordCommand): Promise<ClinicalRecord> {
      const current = await load(repository, command.clinicId, command.id)
      await access.assertAccess(patientIdOf(current), command.actor)
      const patch = validPatch(command.body)
      if (patch.patientId !== undefined && patch.patientId !== current.patientId) {
        await access.assertAccess(patientIdOf(patch), command.actor)
      }
      if (current.status !== DRAFT) throw new Error("conflict")
      return patchDraft(command.clinicId, command.actor.userId, command.id, patch)
    },
    /** Only the author (or the administrator) finalizes a draft. */
    async finalizeRecord(command: FinalizeClinicalRecordCommand): Promise<ClinicalRecord> {
      assertAuthenticated(command.actor)
      const current = await load(repository, command.clinicId, command.id)
      await access.assertAccess(patientIdOf(current), command.actor)
      if (current.createdBy !== command.actor.userId && !hasAdminRole(command.actor.roles)) throw new Error("forbidden")
      if (!finalizable(current)) throw new Error("validation")
      const finalized = { ...current, status: FINALIZED }
      validRecord(finalized)
      return patchDraft(command.clinicId, command.actor.userId, command.id, { status: FINALIZED }, supersededParentId(finalized))
    },
    /** Opens a new draft version of a finalized record. */
    async rectifyRecord(command: RectifyClinicalRecordCommand): Promise<ClinicalRecord> {
      assertAuthenticated(command.actor)
      const current = await load(repository, command.clinicId, command.id)
      await access.assertAccess(patientIdOf(current), command.actor)
      const { reason } = fieldsOf(command.body)
      if (current.status !== FINALIZED || textLength(reason) < MIN_RECTIFICATION_REASON_LENGTH) throw new Error("validation")
      // The parent's `id` must not be copied: stored in the payload it would shadow the new row id on read.
      const draft = {
        ...omit(current, ["id"]),
        status: DRAFT,
        parentId: command.id,
        rectificationReason: reason,
        version: versionOf(current) + 1,
      }
      validRecord(draft)
      return repository.insert({
        clinicId: command.clinicId,
        actorId: command.actor.userId,
        payload: withCreationDefaults(draft, command.actor.userId),
        audit: auditEntry("create"),
      })
    },
  }
}

export function createClinicalRecordUseCases(repository: ClinicalRecordRepository, access: PatientAccessPolicy) {
  return {
    queries: createClinicalRecordQueries(repository, access),
    commands: createClinicalRecordCommands(repository, access),
  }
}

export type ClinicalRecordUseCases = ReturnType<typeof createClinicalRecordUseCases>
