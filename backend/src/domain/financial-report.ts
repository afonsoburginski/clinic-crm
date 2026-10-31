import { activePaidCents, financialStatus } from "@/domain/financial"

/**
 * Pure rules of the financial report, search and export (backend/specs/financial-report.spec.md). The repository
 * only narrows the rows coarsely; every filter, derivation and aggregation below runs here, without a database.
 */

export const CLINIC_TIME_ZONE = "America/Sao_Paulo"

export const ENTRY_KINDS = ["income", "expense"] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

/** Same order the screens list the situations in. */
export const ENTRY_SITUATIONS = ["open", "partial", "paid", "overdue", "cancelled"] as const
export type EntrySituation = (typeof ENTRY_SITUATIONS)[number]

export const PAYMENT_METHODS = ["cash", "pix", "card", "transfer", "boleto", "other"] as const

/** Search page size bounds; the export refuses more rows than `EXPORT_LIMIT`. */
export const MAX_PAGE_SIZE = 200
export const DEFAULT_PAGE_SIZE = 20
export const EXPORT_LIMIT = 10_000
/** A report or search never reads more rows than this (the filters must narrow the rest). */
export const SCAN_LIMIT = 50_000
/** The series fills the gaps between `from` and `to` only up to this many buckets. */
const MAX_FILLED_BUCKETS = 400
const DAILY_MAX_SPAN_DAYS = 30

export const SEARCH_SORTS = [
  "dueDate", "amount", "paid", "balance", "situation", "description", "kind", "category", "competence", "createdAt", "code",
] as const
export type SearchSort = (typeof SEARCH_SORTS)[number]

// ------------------------------------------------------------------ entries

export interface ReportPayment {
  amountCents: number
  method: string
  reversedAt: string | null
}

export interface ReportEntry {
  id: string
  code: string
  kind: EntryKind
  description: string
  category: string
  counterparty: string | null
  patientId: string | null
  competence: string
  dueDate: string
  amountCents: number
  cancelledAt: string | null
  createdAt: string
  payments: ReportPayment[]
}

export interface DerivedEntry extends ReportEntry {
  situation: EntrySituation
  paidCents: number
  balanceCents: number
}

/** The row the repository hands over: the stored payload plus the row's own creation instant (a fallback). */
export interface SourceRow {
  id: string
  payload: Record<string, unknown>
  createdAt: string
}

/** `LAN-` plus the first six characters of the id; the screens derive the same code. */
export const entryCodeOf = (id: string) => `LAN-${id.slice(0, 6).toUpperCase()}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const textOf = (value: unknown) => (typeof value === "string" ? value : "")
const optionalText = (value: unknown) => (typeof value === "string" && value !== "" ? value : null)

function paymentOf(raw: unknown): ReportPayment | null {
  if (!isRecord(raw)) return null
  return {
    amountCents: typeof raw.amountCents === "number" && Number.isFinite(raw.amountCents) ? raw.amountCents : 0,
    method: PAYMENT_METHODS.find((method) => method === raw.method) ?? "other",
    reversedAt: optionalText(raw.reversedAt),
  }
}

/** Reads a stored entry; the type lives in `type` (older rows may only carry `kind`). */
export function entryOf(row: SourceRow): ReportEntry {
  const { payload } = row
  const rawKind = payload.type ?? payload.kind
  return {
    id: row.id,
    code: optionalText(payload.code) ?? entryCodeOf(row.id),
    kind: rawKind === "expense" ? "expense" : "income",
    description: textOf(payload.description),
    category: textOf(payload.category),
    counterparty: optionalText(payload.counterparty),
    patientId: optionalText(payload.patientId),
    competence: textOf(payload.competence),
    dueDate: textOf(payload.dueDate),
    amountCents: typeof payload.amountCents === "number" && Number.isFinite(payload.amountCents) ? payload.amountCents : 0,
    cancelledAt: optionalText(payload.cancelledAt),
    createdAt: optionalText(payload.createdAt) ?? row.createdAt,
    payments: (Array.isArray(payload.payments) ? payload.payments : []).flatMap((raw) => paymentOf(raw) ?? []),
  }
}

/** RN-FIN-002 (the backend order: cancelled, paid, overdue even with a partial payment, partial, open). */
export function derive(entry: ReportEntry, today: string): DerivedEntry {
  const paidCents = activePaidCents(entry.payments)
  return {
    ...entry,
    situation: financialStatus(entry, today),
    paidCents,
    balanceCents: Math.max(0, entry.amountCents - paidCents),
  }
}

/** Today's civil date in the clinic's time zone (`YYYY-MM-DD`). */
export function clinicToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

// ------------------------------------------------------------------ filters

export interface ReportFilters {
  /** Due date range, inclusive. */
  from?: string
  to?: string
  kind?: EntryKind
  situations?: EntrySituation[]
  competence?: string
  q?: string
  /** An entry matches when it has an active payment by one of these methods. */
  methods?: string[]
  categories?: string[]
  minCents?: number
  maxCents?: number
}

export interface SearchParams {
  page: number
  pageSize: number
  sort: SearchSort
  dir: "asc" | "desc"
}

/** Where the query parameters are read from: one value, or every value of a repeated parameter. */
export interface QuerySource {
  one(name: string): string | undefined
  many(name: string): string[]
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; detail: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const COMPETENCE = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_TEXT = 100

function isRealDate(value: string) {
  if (!DATE.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** A list parameter can repeat (`status=open&status=paid`) and can also be comma separated. */
const listOf = (source: QuerySource, name: string, split: boolean) =>
  source.many(name).flatMap((value) => (split ? value.split(",") : [value])).map((v) => v.trim()).filter(Boolean)

const wholeCents = (value: string | undefined) => {
  if (value === undefined || value === "") return { ok: true as const, value: undefined }
  if (!/^\d{1,12}$/.test(value)) return { ok: false as const }
  return { ok: true as const, value: Number(value) }
}

export function parseReportFilters(source: QuerySource): Parsed<ReportFilters> {
  const filters: ReportFilters = {}
  const from = source.one("from") || undefined
  const to = source.one("to") || undefined
  if (from !== undefined && !isRealDate(from)) return { ok: false, detail: "Data inicial inválida (use AAAA-MM-DD)." }
  if (to !== undefined && !isRealDate(to)) return { ok: false, detail: "Data final inválida (use AAAA-MM-DD)." }
  if (from && to && from > to) return { ok: false, detail: "A data inicial não pode ser posterior à final." }
  if (from) filters.from = from
  if (to) filters.to = to

  const kind = source.one("kind") || undefined
  if (kind !== undefined && kind !== "all") {
    if (!ENTRY_KINDS.includes(kind as EntryKind)) return { ok: false, detail: "Tipo de lançamento inválido." }
    filters.kind = kind as EntryKind
  }

  const situations = listOf(source, "status", true).filter((value) => value !== "all")
  const badSituation = situations.find((value) => !ENTRY_SITUATIONS.includes(value as EntrySituation))
  if (badSituation) return { ok: false, detail: `Situação inválida: ${badSituation}.` }
  if (situations.length) filters.situations = [...new Set(situations)] as EntrySituation[]

  const competence = source.one("competence") || undefined
  if (competence !== undefined) {
    if (!COMPETENCE.test(competence)) return { ok: false, detail: "Competência inválida (use AAAA-MM)." }
    filters.competence = competence
  }

  const q = source.one("q")?.trim()
  if (q) {
    if (q.length > MAX_TEXT) return { ok: false, detail: "A busca aceita no máximo 100 caracteres." }
    filters.q = q
  }

  const methods = listOf(source, "method", true)
  const badMethod = methods.find((value) => !PAYMENT_METHODS.includes(value as (typeof PAYMENT_METHODS)[number]))
  if (badMethod) return { ok: false, detail: `Forma de pagamento inválida: ${badMethod}.` }
  if (methods.length) filters.methods = [...new Set(methods)]

  const categories = listOf(source, "category", false)
  if (categories.some((value) => value.length > MAX_TEXT)) return { ok: false, detail: "Categoria inválida." }
  if (categories.length) filters.categories = [...new Set(categories)]

  const min = wholeCents(source.one("minCents"))
  const max = wholeCents(source.one("maxCents"))
  if (!min.ok || !max.ok) return { ok: false, detail: "A faixa de valor deve ser informada em centavos inteiros." }
  if (min.value !== undefined && max.value !== undefined && min.value > max.value) {
    return { ok: false, detail: "O valor mínimo não pode ser maior que o máximo." }
  }
  if (min.value !== undefined) filters.minCents = min.value
  if (max.value !== undefined) filters.maxCents = max.value
  return { ok: true, value: filters }
}

export function parseSearchParams(source: QuerySource): Parsed<SearchParams> {
  const page = source.one("page") ?? "1"
  const pageSize = source.one("pageSize") ?? String(DEFAULT_PAGE_SIZE)
  if (!/^\d{1,6}$/.test(page) || Number(page) < 1) return { ok: false, detail: "Página inválida." }
  if (!/^\d{1,4}$/.test(pageSize) || Number(pageSize) < 1 || Number(pageSize) > MAX_PAGE_SIZE) {
    return { ok: false, detail: `O tamanho da página deve ficar entre 1 e ${MAX_PAGE_SIZE}.` }
  }
  const sort = source.one("sort") || "dueDate"
  if (!SEARCH_SORTS.includes(sort as SearchSort)) return { ok: false, detail: "Ordenação inválida." }
  const dir = source.one("dir") || "asc"
  if (dir !== "asc" && dir !== "desc") return { ok: false, detail: "Direção de ordenação inválida." }
  return { ok: true, value: { page: Number(page), pageSize: Number(pageSize), sort: sort as SearchSort, dir } }
}

const haystackOf = (entry: ReportEntry) =>
  [entry.code, entry.description, entry.category, entry.counterparty ?? ""].join(" ").toLowerCase()

export function matchesFilters(entry: DerivedEntry, filters: ReportFilters): boolean {
  if (filters.kind && entry.kind !== filters.kind) return false
  if (filters.from && !(entry.dueDate >= filters.from)) return false
  if (filters.to && !(entry.dueDate <= filters.to)) return false
  if (filters.competence && entry.competence !== filters.competence) return false
  if (filters.situations && !filters.situations.includes(entry.situation)) return false
  if (filters.minCents !== undefined && entry.amountCents < filters.minCents) return false
  if (filters.maxCents !== undefined && entry.amountCents > filters.maxCents) return false
  if (filters.categories && !filters.categories.includes(entry.category)) return false
  if (filters.q && !haystackOf(entry).includes(filters.q.toLowerCase())) return false
  if (filters.methods) {
    const methods = filters.methods
    if (!entry.payments.some((payment) => !payment.reversedAt && methods.includes(payment.method))) return false
  }
  return true
}

export const applyFilters = (entries: readonly DerivedEntry[], filters: ReportFilters) =>
  entries.filter((entry) => matchesFilters(entry, filters))

// ------------------------------------------------------------------ report

export interface Indicators {
  /** Active payments of the income entries (cancelled entries never count). */
  receivedCents: number
  /** Open balance of the income entries that are not overdue yet (open or partial). */
  receivableCents: number
  /** Open balance of the overdue income entries, even those with a partial payment. */
  overdueCents: number
  /** Active payments of the expense entries. */
  expensesCents: number
  /** `receivedCents - expensesCents`: what was actually settled. */
  resultCents: number
  /** `receivedCents` divided by the income entries with an active payment (paid or partially paid); 0 without any. */
  averageTicketCents: number
  entryCount: number
}

export interface SeriesPoint {
  /** `YYYY-MM-DD` (day) or `YYYY-MM` (month), by due date. */
  period: string
  incomeCents: number
  expenseCents: number
  incomeSettledCents: number
  expenseSettledCents: number
}

export interface SituationShare {
  situation: EntrySituation
  count: number
  amountCents: number
}

export interface MethodShare {
  method: string
  count: number
  incomeCents: number
  expenseCents: number
}

export interface FinancialReport {
  indicators: Indicators
  series: { granularity: "day" | "month"; points: SeriesPoint[] }
  bySituation: SituationShare[]
  byMethod: MethodShare[]
  /** Values the screen offers as filters, computed without the filter they feed. */
  facets: { categories: string[]; competences: string[] }
}

const sum = (values: Iterable<number>) => {
  let total = 0
  for (const value of values) total += value
  return total
}

function dayNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000)
}

const dateOfDayNumber = (days: number) => new Date(days * 86_400_000).toISOString().slice(0, 10)

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  let [year, month] = from.split("-").map(Number)
  const [lastYear, lastMonth] = to.split("-").map(Number)
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

/** Daily when the range is at most 31 days (both ends given), monthly otherwise. */
export function granularityOf(filters: Pick<ReportFilters, "from" | "to">): "day" | "month" {
  if (!filters.from || !filters.to) return "month"
  return dayNumber(filters.to) - dayNumber(filters.from) <= DAILY_MAX_SPAN_DAYS ? "day" : "month"
}

function periodsBetween(filters: ReportFilters, granularity: "day" | "month"): string[] {
  if (!filters.from || !filters.to) return []
  if (granularity === "month") return monthsBetween(filters.from.slice(0, 7), filters.to.slice(0, 7))
  const first = dayNumber(filters.from)
  return Array.from({ length: dayNumber(filters.to) - first + 1 }, (_, index) => dateOfDayNumber(first + index))
}

function seriesOf(entries: readonly DerivedEntry[], filters: ReportFilters) {
  const granularity = granularityOf(filters)
  const width = granularity === "day" ? 10 : 7
  const points = new Map<string, SeriesPoint>()
  const pointOf = (period: string) => {
    let point = points.get(period)
    if (!point) {
      point = { period, incomeCents: 0, expenseCents: 0, incomeSettledCents: 0, expenseSettledCents: 0 }
      points.set(period, point)
    }
    return point
  }
  const filled = periodsBetween(filters, granularity)
  if (filled.length && filled.length <= MAX_FILLED_BUCKETS) for (const period of filled) pointOf(period)
  for (const entry of entries) {
    if (entry.situation === "cancelled" || !DATE.test(entry.dueDate)) continue
    const point = pointOf(entry.dueDate.slice(0, width))
    if (entry.kind === "income") {
      point.incomeCents += entry.amountCents
      point.incomeSettledCents += entry.paidCents
    } else {
      point.expenseCents += entry.amountCents
      point.expenseSettledCents += entry.paidCents
    }
  }
  return { granularity, points: [...points.values()].sort((a, b) => a.period.localeCompare(b.period)) }
}

function indicatorsOf(entries: readonly DerivedEntry[]): Indicators {
  const live = entries.filter((entry) => entry.situation !== "cancelled")
  const income = live.filter((entry) => entry.kind === "income")
  const expense = live.filter((entry) => entry.kind === "expense")
  const receivedCents = sum(income.map((entry) => entry.paidCents))
  const expensesCents = sum(expense.map((entry) => entry.paidCents))
  const paying = income.filter((entry) => entry.paidCents > 0).length
  return {
    receivedCents,
    receivableCents: sum(income.filter((e) => e.situation === "open" || e.situation === "partial").map((e) => e.balanceCents)),
    overdueCents: sum(income.filter((entry) => entry.situation === "overdue").map((entry) => entry.balanceCents)),
    expensesCents,
    resultCents: receivedCents - expensesCents,
    averageTicketCents: paying ? Math.round(receivedCents / paying) : 0,
    entryCount: entries.length,
  }
}

function distinctSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"))
}

/** `entries` are already derived for the clinic's today; the filters are applied here. */
export function buildReport(entries: readonly DerivedEntry[], filters: ReportFilters): FinancialReport {
  const selected = applyFilters(entries, filters)

  const bySituation = ENTRY_SITUATIONS.map((situation) => {
    const own = selected.filter((entry) => entry.situation === situation)
    return { situation, count: own.length, amountCents: sum(own.map((entry) => entry.amountCents)) }
  })

  const methods = new Map<string, MethodShare>()
  for (const entry of selected) {
    for (const payment of entry.payments) {
      if (payment.reversedAt) continue
      const share = methods.get(payment.method) ?? { method: payment.method, count: 0, incomeCents: 0, expenseCents: 0 }
      share.count += 1
      if (entry.kind === "income") share.incomeCents += payment.amountCents
      else share.expenseCents += payment.amountCents
      methods.set(payment.method, share)
    }
  }
  const byMethod = [...methods.values()].sort(
    (a, b) => b.incomeCents + b.expenseCents - (a.incomeCents + a.expenseCents) || a.method.localeCompare(b.method),
  )

  return {
    indicators: indicatorsOf(selected),
    series: seriesOf(selected, filters),
    bySituation,
    byMethod,
    facets: {
      categories: distinctSorted(applyFilters(entries, { ...filters, categories: undefined }).map((entry) => entry.category)),
      competences: distinctSorted(applyFilters(entries, { ...filters, competence: undefined }).map((entry) => entry.competence)).reverse(),
    },
  }
}

// ------------------------------------------------------------------ search and export

const SITUATION_RANK: Record<EntrySituation, number> = { open: 0, partial: 1, overdue: 2, paid: 3, cancelled: 4 }

type Comparator = (a: DerivedEntry, b: DerivedEntry) => number

const text = (read: (entry: DerivedEntry) => string): Comparator => (a, b) => read(a).localeCompare(read(b), "pt-BR")
const number = (read: (entry: DerivedEntry) => number): Comparator => (a, b) => read(a) - read(b)

const COMPARATORS: Record<SearchSort, Comparator> = {
  dueDate: text((entry) => entry.dueDate),
  amount: number((entry) => entry.amountCents),
  paid: number((entry) => entry.paidCents),
  balance: number((entry) => entry.balanceCents),
  situation: number((entry) => SITUATION_RANK[entry.situation]),
  description: text((entry) => entry.description),
  kind: text((entry) => entry.kind),
  category: text((entry) => entry.category),
  competence: text((entry) => entry.competence),
  createdAt: text((entry) => entry.createdAt),
  code: text((entry) => entry.code),
}

/** Equal keys fall back to the due date, the code and the id, so a page never repeats or skips a row. */
export function sortEntries(entries: readonly DerivedEntry[], sort: SearchSort, dir: "asc" | "desc"): DerivedEntry[] {
  const primary = COMPARATORS[sort]
  const sign = dir === "desc" ? -1 : 1
  return [...entries].sort(
    (a, b) =>
      sign * primary(a, b) || COMPARATORS.dueDate(a, b) || COMPARATORS.code(a, b) || a.id.localeCompare(b.id),
  )
}

export interface SearchResult {
  items: DerivedEntry[]
  total: number
  page: number
  pageSize: number
}

export function searchEntries(entries: readonly DerivedEntry[], filters: ReportFilters, params: SearchParams): SearchResult {
  const sorted = sortEntries(applyFilters(entries, filters), params.sort, params.dir)
  const start = (params.page - 1) * params.pageSize
  return { items: sorted.slice(start, start + params.pageSize), total: sorted.length, page: params.page, pageSize: params.pageSize }
}

/** The entry as the API returns it: derived situation and balance, without the payments. */
export interface EntryView {
  id: string
  code: string
  kind: EntryKind
  description: string
  category: string
  counterparty: string | null
  patientId: string | null
  competence: string
  dueDate: string
  amountCents: number
  paidCents: number
  balanceCents: number
  situation: EntrySituation
  /** Distinct payment methods of the active payments, in the order they were registered. */
  methods: string[]
  cancelledAt: string | null
  createdAt: string
}

export function toEntryView(entry: DerivedEntry): EntryView {
  return {
    id: entry.id,
    code: entry.code,
    kind: entry.kind,
    description: entry.description,
    category: entry.category,
    counterparty: entry.counterparty,
    patientId: entry.patientId,
    competence: entry.competence,
    dueDate: entry.dueDate,
    amountCents: entry.amountCents,
    paidCents: entry.paidCents,
    balanceCents: entry.balanceCents,
    situation: entry.situation,
    methods: [...new Set(entry.payments.filter((payment) => !payment.reversedAt).map((payment) => payment.method))],
    cancelledAt: entry.cancelledAt,
    createdAt: entry.createdAt,
  }
}

/** Export order: due date, then code. */
export const exportOrder = (entries: readonly DerivedEntry[]) => sortEntries(entries, "dueDate", "asc")

/** What the database is asked for: the filters it can apply cheaply; the rest is narrowed in `applyFilters`. */
export type CoarseFilters = Pick<ReportFilters, "from" | "to" | "kind" | "competence" | "q" | "minCents" | "maxCents">

export function coarseFiltersOf(filters: ReportFilters): CoarseFilters {
  const { from, to, kind, competence, q, minCents, maxCents } = filters
  return { from, to, kind, competence, q, minCents, maxCents }
}
