import { ENTRY_STATUS_LABELS, KIND_LABELS, METHOD_LABELS } from "@/domain/financial"
import { PAYMENT_METHODS } from "@/domain/schemas"
import type { FinancialEntryStatus, FinancialKind, PaymentMethod } from "@/domain/types"
import type { FinancialQueryFilters, FinancialSearchParams, FinancialSort } from "@/shared/api/financial-report-mappers"
import { formatBirthDate, formatCurrency } from "@/shared/lib/format"
import { emptyState, type DataTableState, type RangeFilterValue } from "@/shared/ui/data-table/lib/types"
import { presetRange, type DateRangeValue } from "@/shared/ui/date-range-picker"

/**
 * Um único estado de filtros alimenta indicadores, gráficos, tabela e exportação: o `DataTable` (modo servidor)
 * guarda `DataTableState` e este módulo o traduz para os parâmetros da API. Os ids abaixo são os das colunas.
 */
export const FILTER_COLUMNS = {
  period: "dueDate",
  kind: "kind",
  status: "status",
  method: "method",
  category: "category",
  competence: "competence",
  amount: "amount",
} as const

const KIND_VALUES = Object.keys(KIND_LABELS) as FinancialKind[]
const STATUS_VALUES = Object.keys(ENTRY_STATUS_LABELS) as FinancialEntryStatus[]

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const listOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item !== "") : typeof value === "string" && value ? [value] : []

/** Estado da tabela → filtros da API. Valores desconhecidos (visão antiga) são ignorados. */
export function filtersFromState(state: Pick<DataTableState, "filters" | "search">): FinancialQueryFilters {
  const { filters } = state
  const filter: FinancialQueryFilters = {}

  const period = filters[FILTER_COLUMNS.period]
  if (isObject(period)) {
    const { from, to } = period as DateRangeValue
    if (from) filter.from = from
    if (to) filter.to = to
  }

  // Receita e despesa juntas equivalem a nenhum filtro de tipo.
  const kinds = listOf(filters[FILTER_COLUMNS.kind]).filter((k): k is FinancialKind => KIND_VALUES.includes(k as FinancialKind))
  if (kinds.length === 1) filter.kind = kinds[0]

  const statuses = listOf(filters[FILTER_COLUMNS.status]).filter((s): s is FinancialEntryStatus => STATUS_VALUES.includes(s as FinancialEntryStatus))
  if (statuses.length) filter.statuses = statuses

  const methods = listOf(filters[FILTER_COLUMNS.method]).filter((m): m is PaymentMethod => PAYMENT_METHODS.includes(m as PaymentMethod))
  if (methods.length) filter.methods = methods

  const categories = listOf(filters[FILTER_COLUMNS.category])
  if (categories.length) filter.categories = categories

  const [competence] = listOf(filters[FILTER_COLUMNS.competence])
  if (competence && /^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) filter.competence = competence

  const amount = filters[FILTER_COLUMNS.amount]
  if (isObject(amount)) {
    const { min, max } = amount as RangeFilterValue
    if (finite(min) && min >= 0) filter.minCents = Math.round(min)
    if (finite(max) && max >= 0) filter.maxCents = Math.round(max)
  }

  const q = state.search.trim()
  if (q) filter.q = q
  return filter
}

/** Coluna da tabela → ordenação da API (`status` é a situação derivada). */
const SORT_BY_COLUMN: Record<string, FinancialSort> = {
  description: "description",
  kind: "kind",
  category: "category",
  competence: "competence",
  dueDate: "dueDate",
  amount: "amount",
  paid: "paid",
  balance: "balance",
  status: "situation",
  code: "code",
  createdAt: "createdAt",
}

/** Página, tamanho e ordenação (só a primeira regra vale: a API ordena por uma coluna). */
export function searchParamsFromState(state: Pick<DataTableState, "pageIndex" | "pageSize" | "sort">): FinancialSearchParams {
  const [rule] = state.sort
  return {
    page: Math.max(1, state.pageIndex + 1),
    pageSize: state.pageSize,
    sort: (rule && SORT_BY_COLUMN[rule.id]) || "dueDate",
    dir: rule?.desc ? "desc" : "asc",
  }
}

/**
 * Ao abrir: vencimentos do mês corrente, por vencimento crescente (como a competência corrente de antes);
 * competência e valor pago ficam no menu "Colunas".
 */
export const defaultFinancialState = (today: string): DataTableState =>
  emptyState({
    filters: { [FILTER_COLUMNS.period]: presetRange("thisMonth", today) },
    sort: [{ id: "dueDate", desc: false }],
    hiddenColumns: ["competence", "paid"],
  })

/** Há algum filtro aplicado? Decide entre "nenhum lançamento" e "nenhum resultado para o filtro". */
export const hasActiveFilters = (filters: FinancialQueryFilters) =>
  Object.values(filters).some((value) => (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== ""))

/** Texto dos filtros aplicados (aba "Resumo" da planilha), uma linha por filtro, em pt-BR. */
export function describeFilters(filters: FinancialQueryFilters): string[] {
  const lines: string[] = []
  if (filters.from || filters.to) {
    const from = filters.from ? formatBirthDate(filters.from) : null
    const to = filters.to ? formatBirthDate(filters.to) : null
    lines.push(`Vencimento: ${from && to ? `${from} a ${to}` : from ? `a partir de ${from}` : `até ${to}`}`)
  }
  if (filters.kind) lines.push(`Tipo: ${KIND_LABELS[filters.kind]}`)
  if (filters.statuses?.length) lines.push(`Situação: ${filters.statuses.map((s) => ENTRY_STATUS_LABELS[s]).join(", ")}`)
  if (filters.methods?.length) lines.push(`Forma de pagamento: ${filters.methods.map((m) => METHOD_LABELS[m]).join(", ")}`)
  if (filters.categories?.length) lines.push(`Categoria: ${filters.categories.join(", ")}`)
  if (filters.competence) {
    const [year, month] = filters.competence.split("-")
    lines.push(`Competência: ${month}/${year}`)
  }
  if (filters.minCents !== undefined || filters.maxCents !== undefined) {
    const min = filters.minCents !== undefined ? formatCurrency(filters.minCents) : null
    const max = filters.maxCents !== undefined ? formatCurrency(filters.maxCents) : null
    lines.push(`Valor: ${min && max ? `${min} a ${max}` : min ? `a partir de ${min}` : `até ${max}`}`)
  }
  if (filters.q) lines.push(`Busca: ${filters.q}`)
  return lines
}
