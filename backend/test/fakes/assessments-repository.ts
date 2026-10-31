import type {
  Assessment,
  AssessmentRepository,
  FindAssessmentsQuery,
  InsertAssessmentCommand,
  PatchAssessmentCommand,
  PatchAssessmentResult,
} from "@/application/ports/assessments"

export class FakeAssessmentRepository implements AssessmentRepository {
  records: Assessment[] = []
  found: FindAssessmentsQuery[] = []
  inserted: InsertAssessmentCommand[] = []
  patched: PatchAssessmentCommand[] = []

  async find(query: FindAssessmentsQuery) {
    this.found.push(query)
    return this.records
  }
  async findById(_clinicId: string, id: string) {
    return this.records.find((record) => record.id === id)
  }
  async insert(command: InsertAssessmentCommand) {
    this.inserted.push(command)
    return { id: "new", ...command.payload }
  }
  async patch(command: PatchAssessmentCommand): Promise<PatchAssessmentResult> {
    this.patched.push(command)
    const current = this.records.find((record) => record.id === command.id)
    if (!current) return { outcome: "not_found" }
    if (command.expectedStatus !== undefined && current.status !== command.expectedStatus) return { outcome: "conflict" }
    if (typeof current.status === "string" && command.blockedStatuses?.includes(current.status)) return { outcome: "conflict" }
    return { outcome: "saved", record: { ...current, ...command.patch } }
  }
}
