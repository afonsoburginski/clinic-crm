import type { AbaRepository } from "@/application/ports/aba"
import {
  changeLockedResource,
  findResource,
  insertResource,
  listResources,
  recordAudit,
  transaction,
} from "@/infrastructure/postgres/repositories/api-resources"

export const postgresAbaRepository: AbaRepository = {
  find: ({ clinicId, kind, filters, professionalId }) => listResources(clinicId, kind, filters, professionalId),
  findById: (clinicId, kind, id) => findResource(clinicId, kind, id),
  insert(command) {
    return transaction(async (client) => {
      const record = await insertResource(client, command.clinicId, command.kind, command.payload)
      await recordAudit(client, command.clinicId, command.actorId, command.kind, record.id, command.audit)
      return record
    })
  },
  change(command) {
    return transaction(async (client) => {
      const result = await changeLockedResource(client, command.clinicId, command.kind, command.id, (current) => ({
        patch: command.change(current),
        result: undefined,
      }))
      if (result.outcome === "not_found") return result
      await recordAudit(client, command.clinicId, command.actorId, command.kind, result.record.id, command.audit)
      return { outcome: "saved", record: result.record }
    })
  },
}
