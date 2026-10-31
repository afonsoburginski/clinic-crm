import type { PoolClient } from "pg"
import { pool, query } from "@/infrastructure/database"

/** SQL shared by the repositories that keep their aggregates as JSONB rows of `api_resources`. */

export type ResourcePayload = Record<string, unknown>
export interface StoredResource { id: string; [field: string]: unknown }
export interface ResourceFilters { patientId?: string; status?: string; from?: string; to?: string }
export interface ResourceAudit { action: "create" | "update"; summary: string }

export type LockedPatchResult =
  | { outcome: "saved"; record: StoredResource }
  | { outcome: "not_found" }
  | { outcome: "conflict" }

interface ResourceRow { id: string; payload: unknown }

const LIST_RESOURCES_SQL =
  "SELECT id,payload FROM api_resources WHERE clinic_id=$1 AND resource_type=$2 AND COALESCE(payload->>'active','true')<>'false' AND ($3::text IS NULL OR payload->>'patientId'=$3) AND ($4::text IS NULL OR payload->>'status'=$4) AND ($5::date IS NULL OR COALESCE(payload->>'start',payload->>'date',payload->>'createdAt')::date >= $5) AND ($6::date IS NULL OR COALESCE(payload->>'start',payload->>'date',payload->>'createdAt')::date <= $6) AND ($7::uuid IS NULL OR EXISTS(SELECT 1 FROM professionals pr JOIN patients p ON p.clinic_id=pr.clinic_id AND p.id=(api_resources.payload->>'patientId')::uuid WHERE pr.clinic_id=api_resources.clinic_id AND pr.id=$7 AND pr.active=true AND (p.main_professional_id=$7 OR EXISTS(SELECT 1 FROM appointments a WHERE a.clinic_id=p.clinic_id AND a.patient_id=p.id AND a.professional_id=$7 AND a.kind='appointment' AND a.status IN ('confirmed','in_progress','completed'))))) ORDER BY updated_at DESC"

function isPayload(value: unknown): value is ResourcePayload {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function payloadOf(value: unknown): ResourcePayload {
  return isPayload(value) ? value : {}
}

/** The stored payload is spread last, so a stray `id` key inside it wins over the row id. */
function toResource(row: ResourceRow): StoredResource {
  return { id: row.id, ...payloadOf(row.payload) }
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool) throw new Error("database_unconfigured")
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await work(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function listResources(
  clinicId: string,
  type: string,
  filters: ResourceFilters,
  professionalId: string | undefined,
): Promise<StoredResource[]> {
  const result = await query<ResourceRow>(LIST_RESOURCES_SQL, [
    clinicId, type, filters.patientId ?? null, filters.status ?? null, filters.from ?? null, filters.to ?? null,
    professionalId ?? null,
  ])
  return result.rows.map(toResource)
}

export async function findResource(clinicId: string, type: string, id: string): Promise<StoredResource | undefined> {
  const result = await query<{ payload: unknown }>(
    "SELECT payload FROM api_resources WHERE clinic_id=$1 AND resource_type=$2 AND id=$3",
    [clinicId, type, id],
  )
  return result.rowCount ? { id, ...payloadOf(result.rows[0].payload) } : undefined
}

export async function insertResource(
  client: PoolClient,
  clinicId: string,
  type: string,
  payload: ResourcePayload,
): Promise<StoredResource> {
  const inserted = await client.query<ResourceRow>(
    "INSERT INTO api_resources(clinic_id,resource_type,payload) VALUES($1,$2,$3::jsonb) RETURNING id,payload",
    [clinicId, type, JSON.stringify(payload)],
  )
  return toResource(inserted.rows[0])
}

/**
 * Merges `patch` over the stored payload under a row lock; `expectedStatus`, when given, must match
 * and the stored status must not be one of `blockedStatuses`.
 */
export async function patchLockedResource(
  client: PoolClient,
  clinicId: string,
  type: string,
  id: string,
  patch: ResourcePayload,
  expectedStatus: string | undefined,
  blockedStatuses: readonly string[] = [],
): Promise<LockedPatchResult> {
  const current = await client.query<{ payload: unknown }>(
    "SELECT payload FROM api_resources WHERE clinic_id=$1 AND resource_type=$2 AND id=$3 FOR UPDATE",
    [clinicId, type, id],
  )
  if (!current.rowCount) return { outcome: "not_found" }
  const before = payloadOf(current.rows[0].payload)
  if (expectedStatus !== undefined && before.status !== expectedStatus) return { outcome: "conflict" }
  if (typeof before.status === "string" && blockedStatuses.includes(before.status)) return { outcome: "conflict" }
  const updated = await client.query<ResourceRow>(
    "UPDATE api_resources SET payload=$4::jsonb,updated_at=now() WHERE clinic_id=$1 AND resource_type=$2 AND id=$3 RETURNING id,payload",
    [clinicId, type, id, JSON.stringify({ ...before, ...patch })],
  )
  return { outcome: "saved", record: toResource(updated.rows[0]) }
}

/** `patch` is merged over the stored payload; without it the row is left untouched. `result` goes back to the caller. */
export interface LockedDecision<T> { patch?: ResourcePayload; result: T }

export type LockedChangeResult<T> =
  | { outcome: "done"; record: StoredResource; result: T }
  | { outcome: "not_found" }

/**
 * Hands the locked row to `decide` inside the transaction; `decide` may throw to abort.
 * `record` is the row as stored after the decision.
 */
export async function changeLockedResource<T>(
  client: PoolClient,
  clinicId: string,
  type: string,
  id: string,
  decide: (current: StoredResource) => LockedDecision<T>,
): Promise<LockedChangeResult<T>> {
  const current = await client.query<ResourceRow>(
    "SELECT id,payload FROM api_resources WHERE clinic_id=$1 AND resource_type=$2 AND id=$3 FOR UPDATE",
    [clinicId, type, id],
  )
  if (!current.rowCount) return { outcome: "not_found" }
  const before = current.rows[0]
  const { patch, result } = decide(toResource(before))
  if (!patch) return { outcome: "done", record: toResource(before), result }
  const updated = await client.query<ResourceRow>(
    "UPDATE api_resources SET payload=$4::jsonb,updated_at=now() WHERE clinic_id=$1 AND resource_type=$2 AND id=$3 RETURNING id,payload",
    [clinicId, type, id, JSON.stringify({ ...payloadOf(before.payload), ...patch })],
  )
  return { outcome: "done", record: toResource(updated.rows[0]), result }
}

/** Clinical payloads are never copied into the audit trail, so `changes` stays NULL. */
export function recordAudit(
  client: PoolClient,
  clinicId: string,
  actorId: string,
  type: string,
  resourceId: string,
  audit: ResourceAudit,
) {
  return client.query(
    "INSERT INTO audit_events(clinic_id,actor_id,action,resource,resource_id,summary,changes) VALUES($1,$2,$3,$4,$5,$6,NULL)",
    [clinicId, actorId, audit.action, type, resourceId, audit.summary],
  )
}
