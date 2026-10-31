import type { PoolClient } from "pg"
import type {
  AuditEventView,
  CatalogItem,
  CatalogPayload,
  CatalogRepository,
  CatalogResource,
  InsertCatalogRecordCommand,
  PatchCatalogRecordCommand,
} from "@/application/ports/catalog"
import { pool, query } from "@/infrastructure/database"

interface ResourceRow { id: string; payload: CatalogPayload }

const LIST_ITEMS_SQL =
  "SELECT id,payload FROM api_resources WHERE clinic_id=$1 AND resource_type=$2 AND COALESCE(payload->>'active','true')<>'false' AND ($3::text IS NULL OR payload->>'patientId'=$3) AND ($4::text IS NULL OR payload->>'status'=$4) AND ($5::date IS NULL OR COALESCE(payload->>'start',payload->>'date',payload->>'createdAt')::date >= $5) AND ($6::date IS NULL OR COALESCE(payload->>'start',payload->>'date',payload->>'createdAt')::date <= $6) AND ($7::uuid IS NULL OR EXISTS(SELECT 1 FROM professionals pr JOIN patients p ON p.clinic_id=pr.clinic_id AND p.id=(api_resources.payload->>'patientId')::uuid WHERE pr.clinic_id=api_resources.clinic_id AND pr.id=$7 AND pr.active=true AND (p.main_professional_id=$7 OR EXISTS(SELECT 1 FROM appointments a WHERE a.clinic_id=p.clinic_id AND a.patient_id=p.id AND a.professional_id=$7 AND a.kind='appointment' AND a.status IN ('confirmed','in_progress','completed'))))) ORDER BY updated_at DESC"

const LIST_AUDIT_SQL =
  `SELECT actor_id AS "actorId",occurred_at AS at,action,resource,resource_id AS "resourceId",CASE WHEN resource IN ('clinical-record','assessment','aba-plan','aba-session','document','document-release') THEN 'Alterou registro clínico' ELSE summary END AS summary,CASE WHEN resource IN ('clinical-record','assessment','aba-plan','aba-session','document','document-release','financial-entry') THEN NULL ELSE changes END AS changes FROM audit_events WHERE clinic_id=$1 AND ($2::text IS NULL OR resource=$2) AND ($3::text IS NULL OR actor_id=$3) ORDER BY occurred_at DESC LIMIT 500`

// `professional` has a real relational table (FKs from patients.main_professional_id and
// appointments.professional_id depend on it); every other catalog kind stays on the generic
// api_resources JSONB store because no migration ever gave them dedicated columns or FKs.
const PROFESSIONALS_COLUMNS = "id,name,active,specialty_ids,schedule,unavailabilities,email,phone,registry,created_at,color_index"

interface ProfessionalRow {
  id: string
  name: string
  active: boolean
  specialty_ids: string[]
  schedule: unknown
  unavailabilities: unknown
  email: string | null
  phone: string | null
  registry: string | null
  created_at: Date
  color_index: number
}

function professionalToItem(row: ProfessionalRow): CatalogItem {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    specialtyIds: row.specialty_ids,
    schedule: row.schedule,
    unavailabilities: row.unavailabilities,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    registry: row.registry ?? undefined,
    createdAt: row.created_at.toISOString(),
    colorIndex: row.color_index,
  }
}

function isPayload(value: unknown): value is CatalogPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function payloadOf(value: unknown): CatalogPayload {
  return isPayload(value) ? value : {}
}

function toItem(row: ResourceRow): CatalogItem {
  return { id: row.id, ...payloadOf(row.payload) }
}

async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
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

function recordAudit(
  client: PoolClient,
  command: InsertCatalogRecordCommand | PatchCatalogRecordCommand,
  resourceId: string,
) {
  const { clinicId, actorId, resource, audit } = command
  return client.query(
    "INSERT INTO audit_events(clinic_id,actor_id,action,resource,resource_id,summary,changes) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [clinicId, actorId, audit.action, resource, resourceId, audit.summary, JSON.stringify(audit.changes)],
  )
}

async function listProfessionals(clinicId: string): Promise<CatalogItem[]> {
  const result = await query<ProfessionalRow>(
    `SELECT ${PROFESSIONALS_COLUMNS} FROM professionals WHERE clinic_id=$1 AND active=true ORDER BY name`,
    [clinicId],
  )
  return result.rows.map(professionalToItem)
}

async function getProfessional(clinicId: string, id: string): Promise<CatalogItem | undefined> {
  const result = await query<ProfessionalRow>(
    `SELECT ${PROFESSIONALS_COLUMNS} FROM professionals WHERE clinic_id=$1 AND id=$2`,
    [clinicId, id],
  )
  return result.rowCount ? professionalToItem(result.rows[0]) : undefined
}

function insertProfessional(client: PoolClient, clinicId: string, payload: CatalogPayload) {
  const specialtyIds = Array.isArray(payload.specialtyIds) ? payload.specialtyIds : []
  return client.query<ProfessionalRow>(
    `INSERT INTO professionals(clinic_id,name,active,specialty_ids,schedule,unavailabilities,email,phone,registry,color_index)
     VALUES($1,$2,$3,$4::uuid[],'[]'::jsonb,'[]'::jsonb,$5,$6,$7,(SELECT COALESCE(count(*),0) FROM professionals WHERE clinic_id=$1))
     RETURNING ${PROFESSIONALS_COLUMNS}`,
    [
      clinicId,
      String(payload.name ?? ""),
      payload.active !== false,
      specialtyIds,
      payload.email ?? null,
      payload.phone ?? null,
      payload.registry ?? null,
    ],
  )
}

async function patchProfessional(client: PoolClient, clinicId: string, id: string, patch: CatalogPayload) {
  const current = await client.query<ProfessionalRow>(
    `SELECT ${PROFESSIONALS_COLUMNS} FROM professionals WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
    [clinicId, id],
  )
  if (!current.rowCount) return undefined
  const before = professionalToItem(current.rows[0])
  const next = { ...before, ...patch }
  const specialtyIds = Array.isArray(next.specialtyIds) ? next.specialtyIds : []
  const updated = await client.query<ProfessionalRow>(
    `UPDATE professionals SET name=$3,active=$4,specialty_ids=$5::uuid[],schedule=$6::jsonb,unavailabilities=$7::jsonb,email=$8,phone=$9,registry=$10
     WHERE clinic_id=$1 AND id=$2 RETURNING ${PROFESSIONALS_COLUMNS}`,
    [
      clinicId,
      id,
      String(next.name ?? ""),
      next.active !== false,
      specialtyIds,
      JSON.stringify(next.schedule ?? []),
      JSON.stringify(next.unavailabilities ?? []),
      next.email ?? null,
      next.phone ?? null,
      next.registry ?? null,
    ],
  )
  return professionalToItem(updated.rows[0])
}

export const postgresCatalogRepository: CatalogRepository = {
  async listItems(clinicId, resource, filters) {
    if (resource === "professional") return listProfessionals(clinicId)
    // $7 scopes clinical resources by professional; catalog resources are never scoped.
    const result = await query<ResourceRow>(LIST_ITEMS_SQL, [
      clinicId, resource, filters.patientId ?? null, filters.status ?? null, filters.from ?? null, filters.to ?? null, null,
    ])
    return result.rows.map(toItem)
  },
  async getItem(clinicId, resource, id) {
    if (resource === "professional") return getProfessional(clinicId, id)
    const result = await query<{ payload: CatalogPayload }>(
      "SELECT payload FROM api_resources WHERE clinic_id=$1 AND resource_type=$2 AND id=$3",
      [clinicId, resource, id],
    )
    return result.rowCount ? { id, ...payloadOf(result.rows[0].payload) } : undefined
  },
  async listAuditEvents({ clinicId, resource, actorId }) {
    const result = await query<AuditEventView>(LIST_AUDIT_SQL, [clinicId, resource ?? null, actorId ?? null])
    return result.rows
  },
  insert(command) {
    return transaction(async (client) => {
      if (command.resource === "professional") {
        const inserted = await insertProfessional(client, command.clinicId, command.payload)
        const item = professionalToItem(inserted.rows[0])
        await recordAudit(client, command, item.id)
        return item
      }
      const inserted = await client.query<ResourceRow>(
        "INSERT INTO api_resources(clinic_id,resource_type,payload) VALUES($1,$2,$3::jsonb) RETURNING id,payload",
        [command.clinicId, command.resource, JSON.stringify(command.payload)],
      )
      await recordAudit(client, command, inserted.rows[0].id)
      return toItem(inserted.rows[0])
    })
  },
  patch(command) {
    return transaction(async (client) => {
      if (command.resource === "professional") {
        const item = await patchProfessional(client, command.clinicId, command.id, command.patch)
        if (!item) return undefined
        await recordAudit(client, command, item.id)
        return item
      }
      const current = await client.query<{ payload: CatalogPayload }>(
        "SELECT payload FROM api_resources WHERE clinic_id=$1 AND resource_type=$2 AND id=$3 FOR UPDATE",
        [command.clinicId, command.resource, command.id],
      )
      if (!current.rowCount) return undefined
      const next = { ...payloadOf(current.rows[0].payload), ...command.patch }
      const updated = await client.query<ResourceRow>(
        "UPDATE api_resources SET payload=$4::jsonb,updated_at=now() WHERE clinic_id=$1 AND resource_type=$2 AND id=$3 RETURNING id,payload",
        [command.clinicId, command.resource, command.id, JSON.stringify(next)],
      )
      await recordAudit(client, command, updated.rows[0].id)
      return toItem(updated.rows[0])
    })
  },
}
