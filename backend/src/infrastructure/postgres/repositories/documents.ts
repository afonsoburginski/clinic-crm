import type { DocumentRepository } from "@/application/ports/documents"
import { query } from "@/infrastructure/database"
import {
  changeLockedResource,
  findResource,
  insertResource,
  listResources,
  recordAudit,
  transaction,
} from "@/infrastructure/postgres/repositories/api-resources"

const TYPE = "document"

export const postgresDocumentRepository: DocumentRepository = {
  find: ({ clinicId, filters, professionalId }) => listResources(clinicId, TYPE, filters, professionalId),
  findById: (clinicId, id) => findResource(clinicId, TYPE, id),
  findClinicalRecord: (clinicId, id) => findResource(clinicId, "clinical-record", id),
  async guardianReceivesDocuments({ clinicId, patientId, guardianId }) {
    const result = await query(
      "SELECT id FROM patient_guardians WHERE clinic_id=$1 AND patient_id=$2 AND guardian_id=$3 AND can_receive_documents=true",
      [clinicId, patientId, guardianId],
    )
    return Boolean(result.rowCount)
  },
  insert(command) {
    return transaction(async (client) => {
      const record = await insertResource(client, command.clinicId, TYPE, command.payload)
      await recordAudit(client, command.clinicId, command.actorId, TYPE, record.id, command.audit)
      return record
    })
  },
  change(command) {
    return transaction(async (client) => {
      const result = await changeLockedResource(client, command.clinicId, TYPE, command.id, (current) => ({
        patch: command.change(current),
        result: undefined,
      }))
      if (result.outcome === "not_found") return result
      await recordAudit(client, command.clinicId, command.actorId, TYPE, result.record.id, command.audit)
      return { outcome: "saved", record: result.record }
    })
  },
}
