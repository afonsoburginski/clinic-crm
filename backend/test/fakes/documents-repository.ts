import type {
  ChangeDocumentCommand,
  ChangeDocumentResult,
  DocumentRecord,
  DocumentRepository,
  FindDocumentsQuery,
  GuardianReceivesDocumentsQuery,
  InsertDocumentCommand,
  LinkedClinicalRecord,
} from "@/application/ports/documents"

export class FakeDocumentRepository implements DocumentRepository {
  records: DocumentRecord[] = []
  clinicalRecords: LinkedClinicalRecord[] = []
  /** `patientId:guardianId` pairs allowed to receive documents. */
  guardians = new Set<string>()
  found: FindDocumentsQuery[] = []
  inserted: InsertDocumentCommand[] = []
  changed: ChangeDocumentCommand[] = []
  guardianChecks: GuardianReceivesDocumentsQuery[] = []

  async find(query: FindDocumentsQuery) {
    this.found.push(query)
    return this.records
  }
  async findById(_clinicId: string, id: string) {
    return this.records.find((record) => record.id === id)
  }
  async findClinicalRecord(_clinicId: string, id: string) {
    return this.clinicalRecords.find((record) => record.id === id)
  }
  async guardianReceivesDocuments(query: GuardianReceivesDocumentsQuery) {
    this.guardianChecks.push(query)
    return this.guardians.has(`${query.patientId}:${query.guardianId}`)
  }
  async insert(command: InsertDocumentCommand) {
    this.inserted.push(command)
    return { id: "new", ...command.payload }
  }
  async change(command: ChangeDocumentCommand): Promise<ChangeDocumentResult> {
    this.changed.push(command)
    const current = this.records.find((record) => record.id === command.id)
    if (!current) return { outcome: "not_found" }
    return { outcome: "saved", record: { ...current, ...command.change(current) } }
  }
}
