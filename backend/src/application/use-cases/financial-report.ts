import { DomainError } from "@/application/errors"
import type { FinancialReportRepository } from "@/application/ports/financial-report"
import type { Actor } from "@/application/ports/patient-access"
import type { PermissionPolicy } from "@/application/ports/permissions"
import { assertAuthenticated } from "@/application/use-cases/clinical-payload"
import {
  applyFilters,
  buildReport,
  clinicToday,
  coarseFiltersOf,
  derive,
  entryOf,
  EXPORT_LIMIT,
  exportOrder,
  parseReportFilters,
  parseSearchParams,
  SCAN_LIMIT,
  searchEntries,
  toEntryView,
  type DerivedEntry,
  type EntryView,
  type FinancialReport,
  type Parsed,
  type QuerySource,
  type ReportFilters,
} from "@/domain/financial-report"

export interface FinancialReportRuntime {
  now(): Date
}

const systemRuntime: FinancialReportRuntime = { now: () => new Date() }

export interface FinancialReportInput {
  clinicId: string
  actor: Actor
  query: QuerySource
}

export interface EntrySearchResponse {
  items: EntryView[]
  total: number
  page: number
  pageSize: number
}

export interface EntryExportResponse {
  items: EntryView[]
  total: number
}

function valid<T>(parsed: Parsed<T>): T {
  if (!parsed.ok) throw new DomainError("validation", parsed.detail)
  return parsed.value
}

export function createFinancialReportUseCases(
  repository: FinancialReportRepository,
  permissions: PermissionPolicy,
  runtime: FinancialReportRuntime = systemRuntime,
) {
  /** Reads the coarse rows and derives each entry for the clinic's today; the caller applies the exact filters. */
  async function load(clinicId: string, filters: ReportFilters): Promise<DerivedEntry[]> {
    const rows = await repository.scan({ clinicId, filters: coarseFiltersOf(filters), limit: SCAN_LIMIT + 1 })
    if (rows.length > SCAN_LIMIT) {
      throw new DomainError("validation", "Há lançamentos demais para estes filtros. Refine o período ou os filtros.")
    }
    const today = clinicToday(runtime.now())
    return rows.map((row) => derive(entryOf(row), today))
  }

  return {
    queries: {
      /** Indicators, series and distributions over the entries that match the filters. */
      async report(input: FinancialReportInput): Promise<FinancialReport> {
        const filters = valid(parseReportFilters(input.query))
        return buildReport(await load(input.clinicId, filters), filters)
      },

      /** One page of the matching entries, sorted on the server; `total` counts every match. */
      async search(input: FinancialReportInput): Promise<EntrySearchResponse> {
        const filters = valid(parseReportFilters(input.query))
        const params = valid(parseSearchParams(input.query))
        const result = searchEntries(await load(input.clinicId, filters), filters, params)
        return { items: result.items.map(toEntryView), total: result.total, page: result.page, pageSize: result.pageSize }
      },
    },
    commands: {
      /**
       * Every matching entry, for the client to build the spreadsheet. Needs `finance:export` on top of
       * `finance:read`, refuses more than `EXPORT_LIMIT` rows, and audits the export (count only, no values).
       */
      async exportEntries(input: FinancialReportInput): Promise<EntryExportResponse> {
        assertAuthenticated(input.actor)
        if (!permissions.has(input.actor, "finance:read") || !permissions.has(input.actor, "finance:export")) {
          throw new DomainError("forbidden", "Seu perfil não pode exportar o financeiro.")
        }
        const filters = valid(parseReportFilters(input.query))
        const matching = exportOrder(applyFilters(await load(input.clinicId, filters), filters))
        if (matching.length > EXPORT_LIMIT) {
          throw new DomainError(
            "validation",
            `A exportação aceita até ${EXPORT_LIMIT.toLocaleString("pt-BR")} lançamentos. Refine o período ou os filtros.`,
          )
        }
        await repository.recordExport({ clinicId: input.clinicId, actorId: input.actor.userId, count: matching.length })
        return { items: matching.map(toEntryView), total: matching.length }
      },
    },
  }
}

export type FinancialReportUseCases = ReturnType<typeof createFinancialReportUseCases>
