import type { PoolClient } from "pg"
import type { ClinicalRecordRepository } from "@/application/ports/clinical-records"
import {
  findResource,
  insertResource,
  listResources,
  patchLockedResource,
  recordAudit,
  transaction,
} from "@/infrastructure/postgres/repositories/api-resources"

const TYPE = "clinical-record"

/** Marks the parent as superseded, but only while it is still finalized. */
function supersede(client: PoolClient, clinicId: string, parentId: string) {
  return client.query(
    "UPDATE api_resources SET payload=jsonb_set(payload,'{status}','\"superseded\"'::jsonb),updated_at=now() WHERE clinic_id=$1 AND resource_type='clinical-record' AND id=$2 AND payload->>'status'='finalized'",
    [clinicId, parentId],
  )
}

export const postgresClinicalRecordRepository: ClinicalRecordRepository = {
  find: ({ clinicId, filters, professionalId }) => listResources(clinicId, TYPE, filters, professionalId),
  findById: (clinicId, id) => findResource(clinicId, TYPE, id),
  insert(command) {
    return transaction(async (client) => {
      const record = await insertResource(client, command.clinicId, TYPE, command.payload)
      await recordAudit(client, command.clinicId, command.actorId, TYPE, record.id, command.audit)
      return record
    })
  },
  patch(command) {
    return transaction(async (client) => {
      const result = await patchLockedResource(
        client, command.clinicId, TYPE, command.id, command.patch, command.expectedStatus,
      )
      if (result.outcome !== "saved") return result
      if (command.supersedesId) await supersede(client, command.clinicId, command.supersedesId)
      await recordAudit(client, command.clinicId, command.actorId, TYPE, result.record.id, command.audit)
      return result
    })
  },
}
