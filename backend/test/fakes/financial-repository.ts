import type {
  ChangeFinancialEntryCommand,
  ChangeFinancialEntryResult,
  FinancialAudit,
  FinancialRecord,
  FinancialRepository,
  FindFinancialEntriesQuery,
  InsertFinancialEntryCommand,
} from "@/application/ports/financial"

export class FakeFinancialRepository implements FinancialRepository {
  records: FinancialRecord[] = []
  found: FindFinancialEntriesQuery[] = []
  inserted: InsertFinancialEntryCommand[] = []
  /** What was written by `change`, and the audit entries recorded with it. */
  written: Array<{ id: string; patch: Record<string, unknown> }> = []
  audits: FinancialAudit[] = []

  async find(query: FindFinancialEntriesQuery) {
    this.found.push(query)
    return this.records
  }
  async findById(_clinicId: string, id: string) {
    return this.records.find((record) => record.id === id)
  }
  async insert(command: InsertFinancialEntryCommand) {
    this.inserted.push(command)
    this.audits.push(command.audit)
    return { id: "new", ...command.payload }
  }
  async change<T>(command: ChangeFinancialEntryCommand<T>): Promise<ChangeFinancialEntryResult<T>> {
    const current = this.records.find((record) => record.id === command.id)
    if (!current) return { outcome: "not_found" }
    const { patch, audit, result } = command.change(current)
    if (patch) this.written.push({ id: command.id, patch })
    if (audit) this.audits.push(audit)
    return { outcome: "done", record: patch ? { ...current, ...patch } : current, result }
  }
}
