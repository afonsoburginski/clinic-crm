import type { CoarseFilters, SourceRow } from "@/domain/financial-report"

/** The financial report, search and export read the stored entries and audit the export. */
export interface ScanFinancialEntriesQuery {
  clinicId: string
  filters: CoarseFilters
  /** At most this many rows come back; the use case asks for one more than its cap to detect overflow. */
  limit: number
}

export interface RecordFinancialExportCommand {
  clinicId: string
  actorId: string
  /** Number of entries exported: the only datum the audit keeps about the export. */
  count: number
}

export interface FinancialReportRepository {
  scan(query: ScanFinancialEntriesQuery): Promise<SourceRow[]>
  recordExport(command: RecordFinancialExportCommand): Promise<void>
}
