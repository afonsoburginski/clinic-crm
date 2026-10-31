import type { AssessmentRepository } from "@/application/ports/assessments"
import {
  findResource,
  insertResource,
  listResources,
  patchLockedResource,
  recordAudit,
  transaction,
} from "@/infrastructure/postgres/repositories/api-resources"

const TYPE = "assessment"

export const postgresAssessmentRepository: AssessmentRepository = {
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
        client, command.clinicId, TYPE, command.id, command.patch, command.expectedStatus, command.blockedStatuses,
      )
      if (result.outcome !== "saved") return result
      await recordAudit(client, command.clinicId, command.actorId, TYPE, result.record.id, command.audit)
      return result
    })
  },
}
