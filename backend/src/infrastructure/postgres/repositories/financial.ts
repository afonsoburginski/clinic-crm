import type { PoolClient } from "pg"
import type {
  ChangeFinancialEntryCommand,
  ChangeFinancialEntryResult,
  FinancialAudit,
  FinancialRepository,
} from "@/application/ports/financial"
import {
  changeLockedResource,
  findResource,
  insertResource,
  listResources,
  transaction,
} from "@/infrastructure/postgres/repositories/api-resources"

const TYPE = "financial-entry"

/** Financial entries are not clinical: the audit lists the fields touched (with no values) when it has them. */
function recordFinancialAudit(
  client: PoolClient,
  clinicId: string,
  actorId: string,
  resourceId: string,
  audit: FinancialAudit,
) {
  const changes = audit.changedFields
    ? JSON.stringify(audit.changedFields.map((field) => ({ field, from: null, to: null })))
    : null
  return client.query(
    "INSERT INTO audit_events(clinic_id,actor_id,action,resource,resource_id,summary,changes) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [clinicId, actorId, audit.action, TYPE, resourceId, audit.summary, changes],
  )
}

export const postgresFinancialRepository: FinancialRepository = {
  find: ({ clinicId, filters }) => listResources(clinicId, TYPE, filters, undefined),
  findById: (clinicId, id) => findResource(clinicId, TYPE, id),
  insert(command) {
    return transaction(async (client) => {
      const record = await insertResource(client, command.clinicId, TYPE, command.payload)
      await recordFinancialAudit(client, command.clinicId, command.actorId, record.id, command.audit)
      return record
    })
  },
  change<T>(command: ChangeFinancialEntryCommand<T>): Promise<ChangeFinancialEntryResult<T>> {
    return transaction(async (client) => {
      const changed = await changeLockedResource(client, command.clinicId, TYPE, command.id, (current) => {
        const mutation = command.change(current)
        return { patch: mutation.patch, result: mutation }
      })
      if (changed.outcome === "not_found") return changed
      const { audit, result } = changed.result
      if (audit) await recordFinancialAudit(client, command.clinicId, command.actorId, changed.record.id, audit)
      return { outcome: "done", record: changed.record, result }
    })
  },
}
