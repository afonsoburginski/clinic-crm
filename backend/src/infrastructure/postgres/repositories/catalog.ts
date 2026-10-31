import type { PoolClient } from "pg"
import type {
  AuditEventView,
  CatalogItem,
  CatalogPayload,
  CatalogRepository,
  InsertCatalogRecordCommand,
  PatchCatalogRecordCommand,
} from "@/application/ports/catalog"
import { pool, query } from "@/infrastructure/database"

interface ResourceRow { id: string; payload: CatalogPayload }

const LIST_ITEMS_SQL =
  "SELECT id,payload FROM api_resources WHERE clinic_id=$1 AND resource_type=$2 AND COALESCE(payload->>'active','true')<>'false' AND ($3::text IS NULL OR payload->>'patientId'=$3) AND ($4::text IS NULL OR payload->>'status'=$4) AND ($5::date IS NULL OR COALESCE(payload->>'start',payload->>'date',payload->>'createdAt')::date >= $5) AND ($6::date IS NULL OR COALESCE(payload->>'start',payload->>'date',payload->>'createdAt')::date <= $6) AND ($7::uuid IS NULL OR EXISTS(SELECT 1 FROM professionals pr JOIN patients p ON p.clinic_id=pr.clinic_id AND p.id=(api_resources.payload->>'patientId')::uuid WHERE pr.clinic_id=api_resources.clinic_id AND pr.id=$7 AND pr.active=true AND (p.main_professional_id=$7 OR EXISTS(SELECT 1 FROM appointments a WHERE a.clinic_id=p.clinic_id AND a.patient_id=p.id AND a.professional_id=$7 AND a.kind='appointment' AND a.status IN ('confirmed','in_progress','completed'))))) ORDER BY updated_at DESC"

const LIST_AUDIT_SQL =
  `SELECT actor_id AS "actorId",occurred_at AS at,action,resource,resource_id AS "resourceId",CASE WHEN resource IN ('clinical-record','assessment','aba-plan','aba-session','document','document-release') THEN 'Alterou registro clínico' ELSE summary END AS summary,CASE WHEN resource IN ('clinical-record','assessment','aba-plan','aba-session','document','document-release','financial-entry') THEN NULL ELSE changes END AS changes FROM audit_events WHERE clinic_id=$1 AND ($2::text IS NULL OR resource=$2) AND ($3::text IS NULL OR actor_id=$3) ORDER BY occurred_at DESC LIMIT 500`

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

export const postgresCatalogRepository: CatalogRepository = {
  async listItems(clinicId, resource, filters) {
    // $7 scopes clinical resources by professional; catalog resources are never scoped.
    const result = await query<ResourceRow>(LIST_ITEMS_SQL, [
      clinicId, resource, filters.patientId ?? null, filters.status ?? null, filters.from ?? null, filters.to ?? null, null,
    ])
    return result.rows.map(toItem)
  },
  async getItem(clinicId, resource, id) {
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
