import { and, asc, eq, sql, type SQL } from "drizzle-orm"
import type {
  FinancialReportRepository,
  RecordFinancialExportCommand,
  ScanFinancialEntriesQuery,
} from "@/application/ports/financial-report"
import type { CoarseFilters, SourceRow } from "@/domain/financial-report"
import { db, type Database } from "@/infrastructure/postgres/drizzle"
import { apiResources, auditEvents } from "@/infrastructure/postgres/schema"

/** Both the database and an open transaction run these queries. */
export type Executor = Pick<Database, "select" | "insert">

/** Same resource type the financial repository stores its entries under. */
export const ENTRY_RESOURCE = "financial-entry"

// ------------------------------------------------------------------ payload fields (mirror `entryOf` in the domain)

const payload = sql`${apiResources.payload}`
/**
 * The key is a SQL literal, never a bound parameter: `jsonb -> $1` with an untyped parameter is ambiguous in
 * PostgreSQL. It comes from this closed union, not from the request.
 */
const textField = (name: "description" | "category" | "counterparty" | "dueDate" | "competence") => {
  const key = sql.raw(`'${name}'`)
  return sql`coalesce(case when jsonb_typeof(${payload}->${key}) = 'string' then ${payload}->>${key} end, '')`
}
/** `type`, falling back to `kind`; anything but `expense` reads as income, like the domain does. */
const kindField = sql`case when coalesce(${payload}->>'type', ${payload}->>'kind') = 'expense' then 'expense' else 'income' end`
const amountField = sql`coalesce(case when jsonb_typeof(${payload}->'amountCents') = 'number' then (${payload}->>'amountCents')::numeric end, 0)`
/** The code shown on screen is derived from the id, so a search by code finds the entry. */
const haystackField = sql`concat_ws(' ', 'LAN-' || upper(left(${apiResources.id}::text, 6)), ${textField("description")}, ${textField("category")}, ${textField("counterparty")})`

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&")
const isAscii = (value: string) => /^[\x00-\x7f]*$/.test(value)

/**
 * The cheap filters. They only ever narrow: `applyFilters` in the domain repeats every one of them, so
 * a row this query lets through but the rules reject is dropped there. Dates are `YYYY-MM-DD` text compared bytewise.
 * A text search with non-ASCII characters is left to the domain (case folding differs by collation).
 */
export function entryConditions(clinicId: string, filters: CoarseFilters): SQL {
  const conditions: (SQL | undefined)[] = [
    eq(apiResources.clinicId, clinicId),
    eq(apiResources.resourceType, ENTRY_RESOURCE),
    filters.kind ? sql`${kindField} = ${filters.kind}` : undefined,
    filters.from ? sql`${textField("dueDate")} collate "C" >= ${filters.from}` : undefined,
    filters.to ? sql`${textField("dueDate")} collate "C" <= ${filters.to}` : undefined,
    filters.competence ? sql`${textField("competence")} = ${filters.competence}` : undefined,
    filters.minCents !== undefined ? sql`${amountField} >= ${filters.minCents}` : undefined,
    filters.maxCents !== undefined ? sql`${amountField} <= ${filters.maxCents}` : undefined,
    filters.q && isAscii(filters.q) ? sql`${haystackField} ilike ${`%${escapeLike(filters.q)}%`}` : undefined,
  ]
  return and(...conditions)!
}

/** Built, not run, so tests can read its SQL. */
export const scanEntriesQuery = (executor: Executor, query: ScanFinancialEntriesQuery) =>
  executor
    .select({ id: apiResources.id, payload: apiResources.payload, createdAt: apiResources.createdAt })
    .from(apiResources)
    .where(entryConditions(query.clinicId, query.filters))
    .orderBy(asc(apiResources.createdAt), asc(apiResources.id))
    .limit(query.limit)

/** The audit keeps the fact and the count; no value, no filter, no description. `changes` stays NULL. */
export const exportAuditQuery = (executor: Executor, command: RecordFinancialExportCommand) =>
  executor.insert(auditEvents).values({
    clinicId: command.clinicId,
    actorId: command.actorId,
    action: "export",
    resource: ENTRY_RESOURCE,
    resourceId: "export",
    summary: command.count === 1 ? "Exportou 1 lançamento" : `Exportou ${command.count} lançamentos`,
    changes: null,
  })

function toSource(row: { id: string; payload: unknown; createdAt: Date }): SourceRow {
  const stored = row.payload
  return {
    id: row.id,
    payload: typeof stored === "object" && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {},
    createdAt: row.createdAt.toISOString(),
  }
}

export function createPostgresFinancialReport(database: () => Database): FinancialReportRepository {
  return {
    async scan(query) {
      return (await scanEntriesQuery(database(), query)).map(toSource)
    },
    async recordExport(command) {
      await exportAuditQuery(database(), command)
    },
  }
}

export const postgresFinancialReport = createPostgresFinancialReport(db)
