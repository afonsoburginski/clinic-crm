import type {
  ClinicalRecord,
  ClinicalRecordRepository,
  FindClinicalRecordsQuery,
  InsertClinicalRecordCommand,
  PatchClinicalRecordCommand,
  PatchClinicalRecordResult,
} from "@/application/ports/clinical-records"

export class FakeClinicalRecordRepository implements ClinicalRecordRepository {
  records: ClinicalRecord[] = []
  found: FindClinicalRecordsQuery[] = []
  inserted: InsertClinicalRecordCommand[] = []
  patched: PatchClinicalRecordCommand[] = []

  async find(query: FindClinicalRecordsQuery) {
    this.found.push(query)
    return this.records
  }
  async findById(_clinicId: string, id: string) {
    return this.records.find((record) => record.id === id)
  }
  async insert(command: InsertClinicalRecordCommand) {
    this.inserted.push(command)
    return { id: "new", ...command.payload }
  }
  async patch(command: PatchClinicalRecordCommand): Promise<PatchClinicalRecordResult> {
    this.patched.push(command)
    const current = this.records.find((record) => record.id === command.id)
    if (!current) return { outcome: "not_found" }
    if (current.status !== command.expectedStatus) return { outcome: "conflict" }
    return { outcome: "saved", record: { ...current, ...command.patch } }
  }
}
