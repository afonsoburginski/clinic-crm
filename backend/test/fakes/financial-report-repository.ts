import type {
  FinancialReportRepository,
  RecordFinancialExportCommand,
  ScanFinancialEntriesQuery,
} from "@/application/ports/financial-report"
import type { SourceRow } from "@/domain/financial-report"

/** Hands back the rows it was given (the real repository narrows them in SQL) and records what was asked. */
export class FakeFinancialReportRepository implements FinancialReportRepository {
  rows: SourceRow[] = []
  scans: ScanFinancialEntriesQuery[] = []
  exports: RecordFinancialExportCommand[] = []

  async scan(query: ScanFinancialEntriesQuery) {
    this.scans.push(query)
    return this.rows.slice(0, query.limit)
  }

  async recordExport(command: RecordFinancialExportCommand) {
    this.exports.push(command)
  }
}
