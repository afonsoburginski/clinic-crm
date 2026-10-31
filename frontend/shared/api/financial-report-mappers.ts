import { PAYMENT_METHODS } from "@/domain/schemas"
import type { FinancialEntry, FinancialEntryStatus, FinancialKind, PaymentMethod } from "@/domain/types"

import { count, isRow, text, type Row } from "./backend-mappers"
import { toFinancialEntry } from "./financial-mappers"

/**
 * `GET /financial/report`, `/financial/entries/search` e `/financial/export` (backend/specs/financial-report.spec.md):
 * os filtros que a tela e a API compartilham, e a tradução das respostas para os tipos do módulo. Valores em centavos.
 */

export interface FinancialQueryFilters {
  /** Vencimento, inclusivo (`AAAA-MM-DD`). */
  from?: string
  to?: string
  kind?: FinancialKind
  /** Situação derivada. */
  statuses?: FinancialEntryStatus[]
  competence?: string
  q?: string
  methods?: PaymentMethod[]
  categories?: string[]
  minCents?: number
  maxCents?: number
}

export const FINANCIAL_SORTS = ["dueDate", "amount", "paid", "balance", "situation", "description", "kind", "category", "competence", "createdAt", "code"] as const
export type FinancialSort = (typeof FINANCIAL_SORTS)[number]

export interface FinancialSearchParams {
  /** A partir de 1. */
  page: number
  pageSize: number
  sort: FinancialSort
  dir: "asc" | "desc"
}

/** Parâmetros da API; lista vira parâmetro repetido (o `http-client` cuida) e o que está vazio sai da URL. */
export function reportQueryOf(filters: FinancialQueryFilters) {
  return {
    from: filters.from,
    to: filters.to,
    kind: filters.kind,
    status: filters.statuses,
    competence: filters.competence,
    q: filters.q?.trim() || undefined,
    method: filters.methods,
    category: filters.categories,
    minCents: filters.minCents,
    maxCents: filters.maxCents,
  }
}

export const searchQueryOf = (filters: FinancialQueryFilters, params: FinancialSearchParams) => ({
  ...reportQueryOf(filters),
  page: params.page,
  pageSize: params.pageSize,
  sort: params.sort,
  dir: params.dir,
})

// ---------------------------------------------------------------- linhas

const SITUATIONS: readonly FinancialEntryStatus[] = ["open", "partial", "paid", "overdue", "cancelled"]
const situationOf = (value: unknown): FinancialEntryStatus => SITUATIONS.find((s) => s === value) ?? "open"
const methodOf = (value: unknown): PaymentMethod => PAYMENT_METHODS.find((m) => m === value) ?? "other"
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [])
const rows = (value: unknown) => (Array.isArray(value) ? value.filter(isRow) : [])

/** Lançamento da lista: a API já devolve situação, pago e saldo derivados (com "hoje" no fuso da clínica). */
export interface FinancialListRow {
  entry: FinancialEntry
  paidCents: number
  balanceCents: number
  status: FinancialEntryStatus
  /** Formas dos pagamentos ativos, sem repetição. */
  methods: PaymentMethod[]
}

export function toFinancialListRow(raw: Row): FinancialListRow {
  return {
    entry: toFinancialEntry(raw),
    paidCents: count(raw.paidCents),
    balanceCents: count(raw.balanceCents),
    status: situationOf(raw.situation),
    methods: strings(raw.methods).map(methodOf),
  }
}

export interface FinancialPage {
  items: FinancialListRow[]
  total: number
  page: number
  pageSize: number
}

export function toFinancialPage(raw: Row): FinancialPage {
  return {
    items: rows(raw.items).map(toFinancialListRow),
    total: count(raw.total),
    page: count(raw.page, 1),
    pageSize: count(raw.pageSize),
  }
}

export interface FinancialExportResult {
  rows: FinancialListRow[]
  total: number
}

export function toFinancialExport(raw: Row): FinancialExportResult {
  const list = rows(raw.items).map(toFinancialListRow)
  return { rows: list, total: count(raw.total, list.length) }
}

// ---------------------------------------------------------------- relatório

export interface FinancialIndicators {
  receivedCents: number
  receivableCents: number
  overdueCents: number
  expensesCents: number
  resultCents: number
  averageTicketCents: number
  entryCount: number
}

export interface FinancialSeriesPoint {
  /** `AAAA-MM-DD` (dia) ou `AAAA-MM` (mês), pelo vencimento. */
  period: string
  incomeCents: number
  expenseCents: number
  incomeSettledCents: number
  expenseSettledCents: number
}

export interface FinancialSituationShare {
  situation: FinancialEntryStatus
  count: number
  amountCents: number
}

export interface FinancialMethodShare {
  method: PaymentMethod
  count: number
  incomeCents: number
  expenseCents: number
}

export interface FinancialReport {
  indicators: FinancialIndicators
  series: { granularity: "day" | "month"; points: FinancialSeriesPoint[] }
  bySituation: FinancialSituationShare[]
  byMethod: FinancialMethodShare[]
  facets: { categories: string[]; competences: string[] }
}

const rowOf = (value: unknown): Row => (isRow(value) ? value : {})

export function toFinancialReport(raw: Row): FinancialReport {
  const indicators = rowOf(raw.indicators)
  const series = rowOf(raw.series)
  const facets = rowOf(raw.facets)
  return {
    indicators: {
      receivedCents: count(indicators.receivedCents),
      receivableCents: count(indicators.receivableCents),
      overdueCents: count(indicators.overdueCents),
      expensesCents: count(indicators.expensesCents),
      resultCents: count(indicators.resultCents),
      averageTicketCents: count(indicators.averageTicketCents),
      entryCount: count(indicators.entryCount),
    },
    series: {
      granularity: series.granularity === "day" ? "day" : "month",
      points: rows(series.points).map((point) => ({
        period: text(point.period),
        incomeCents: count(point.incomeCents),
        expenseCents: count(point.expenseCents),
        incomeSettledCents: count(point.incomeSettledCents),
        expenseSettledCents: count(point.expenseSettledCents),
      })),
    },
    bySituation: rows(raw.bySituation).map((share) => ({
      situation: situationOf(share.situation),
      count: count(share.count),
      amountCents: count(share.amountCents),
    })),
    byMethod: rows(raw.byMethod).map((share) => ({
      method: methodOf(share.method),
      count: count(share.count),
      incomeCents: count(share.incomeCents),
      expenseCents: count(share.expenseCents),
    })),
    facets: { categories: strings(facets.categories), competences: strings(facets.competences) },
  }
}
