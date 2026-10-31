import type {
  AbaKind,
  AbaRecord,
  AbaRepository,
  ChangeAbaRecordCommand,
  ChangeAbaRecordResult,
  FindAbaRecordsQuery,
  InsertAbaRecordCommand,
} from "@/application/ports/aba"

export class FakeAbaRepository implements AbaRepository {
  records: Record<AbaKind, AbaRecord[]> = { "aba-plan": [], "aba-session": [] }
  found: FindAbaRecordsQuery[] = []
  inserted: InsertAbaRecordCommand[] = []
  changed: ChangeAbaRecordCommand[] = []

  async find(query: FindAbaRecordsQuery) {
    this.found.push(query)
    return this.records[query.kind]
  }
  async findById(_clinicId: string, kind: AbaKind, id: string) {
    return this.records[kind].find((record) => record.id === id)
  }
  async insert(command: InsertAbaRecordCommand) {
    this.inserted.push(command)
    return { id: "new", ...command.payload }
  }
  async change(command: ChangeAbaRecordCommand): Promise<ChangeAbaRecordResult> {
    this.changed.push(command)
    const current = this.records[command.kind].find((record) => record.id === command.id)
    if (!current) return { outcome: "not_found" }
    return { outcome: "saved", record: { ...current, ...command.change(current) } }
  }
}
