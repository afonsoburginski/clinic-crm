import { formatRangeLabel, normalizeRange, rangeContains } from "@/shared/ui/date-range-picker/lib/range"

import { formatMoney } from "./money"
import type { FilterConfig, FilterOption, FilterSpec, FilterState, FilterValue, RangeFilterValue } from "./types"

/** Minúsculas e sem acento: "Jose" encontra "José". */
export const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const toList = (value: string | string[] | null | undefined): string[] => (value == null ? [] : Array.isArray(value) ? value : [value])

export function isFilterActive(value: FilterValue | undefined): boolean {
  if (value === undefined) return false
  if (typeof value === "string") return value !== ""
  if (Array.isArray(value)) return value.length > 0
  if ("from" in value || "to" in value) return !!(value as { from?: string }).from || !!(value as { to?: string }).to
  return finite((value as RangeFilterValue).min) || finite((value as RangeFilterValue).max)
}

/** Valor vindo de fora (visão salva, URL) → valor que o controle entende; o que não serve vira `undefined`. */
export function normalizeFilterValue<T>(config: FilterConfig<T>, raw: unknown): FilterValue | undefined {
  switch (config.kind) {
    case "select":
      return typeof raw === "string" && raw ? raw : undefined
    case "multiselect":
    case "status": {
      const list = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string" && v !== "") : []
      return list.length ? [...new Set(list)] : undefined
    }
    case "range":
    case "money": {
      if (!isObject(raw)) return undefined
      let [min, max] = [finite(raw.min) ? raw.min : undefined, finite(raw.max) ? raw.max : undefined]
      if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min]
      return min === undefined && max === undefined ? undefined : { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }
    }
    case "date-range": {
      if (!isObject(raw)) return undefined
      const range = normalizeRange({ from: raw.from as string | undefined, to: raw.to as string | undefined })
      return range.from || range.to ? range : undefined
    }
  }
}

function matches<T>(config: FilterConfig<T>, row: T, value: FilterValue): boolean {
  switch (config.kind) {
    case "select":
      return typeof value !== "string" || !value || config.value(row) === value
    case "multiselect":
    case "status": {
      if (!Array.isArray(value) || !value.length) return true
      const own = toList(config.value(row))
      return value.some((v) => own.includes(v))
    }
    case "range":
    case "money": {
      const { min, max } = value as RangeFilterValue
      if (!finite(min) && !finite(max)) return true
      const own = config.value(row)
      if (!finite(own)) return false
      return (!finite(min) || own >= min) && (!finite(max) || own <= max)
    }
    case "date-range":
      return rangeContains(value as { from?: string; to?: string }, config.value(row))
  }
}

/** Busca global: todos os termos precisam aparecer (sem acento, sem diferenciar caixa). */
export function matchesSearch(text: string, search: string): boolean {
  const terms = fold(search).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const haystack = fold(text)
  return terms.every((term) => haystack.includes(term))
}

export interface FilterOptions<T> {
  /** Ignora este filtro (usado nas contagens facetadas: cada opção conta sem o próprio filtro aplicado). */
  skipId?: string
  searchText?: (row: T) => string
}

export function applyFilters<T>(rows: readonly T[], specs: readonly FilterSpec<T>[], filters: FilterState, search: string, options: FilterOptions<T> = {}): T[] {
  const active = specs.filter((s) => s.id !== options.skipId && isFilterActive(filters[s.id]))
  const searching = !!options.searchText && search.trim() !== ""
  return rows.filter(
    (row) =>
      active.every((s) => matches(s.config, row, filters[s.id])) && (!searching || matchesSearch(options.searchText!(row), search))
  )
}

/** Quantas linhas cada opção traria somada aos demais filtros ativos (contagens do multiselect/status/select). */
export function facetCounts<T>(
  rows: readonly T[],
  specs: readonly FilterSpec<T>[],
  id: string,
  filters: FilterState,
  search: string,
  searchText?: (row: T) => string
): Record<string, number> {
  const config = specs.find((s) => s.id === id)?.config
  if (!config || (config.kind !== "multiselect" && config.kind !== "status" && config.kind !== "select")) return {}
  const counts: Record<string, number> = Object.fromEntries(config.options.map((o) => [o.value, 0]))
  for (const row of applyFilters(rows, specs, filters, search, { skipId: id, searchText })) {
    for (const value of toList(config.value(row))) if (value in counts) counts[value] += 1
  }
  return counts
}

const optionLabel = (options: FilterOption[], value: string) => options.find((o) => o.value === value)?.label ?? value

/** Texto do chip de um filtro ativo: "Situação: Aberto, Vencido", "Valor: R$ 10,00 – R$ 50,00". */
export function describeFilter<T>(config: FilterConfig<T>, value: FilterValue): string {
  switch (config.kind) {
    case "select":
      return `${config.label}: ${optionLabel(config.options, String(value))}`
    case "multiselect":
    case "status":
      return `${config.label}: ${(value as string[]).map((v) => optionLabel(config.options, v)).join(", ")}`
    case "range":
    case "money": {
      const { min, max } = value as RangeFilterValue
      const show = (n: number) => (config.kind === "money" ? formatMoney(n) : `${n}${config.kind === "range" && config.unit ? ` ${config.unit}` : ""}`)
      if (finite(min) && finite(max)) return `${config.label}: ${show(min)} – ${show(max)}`
      if (finite(min)) return `${config.label}: a partir de ${show(min)}`
      return `${config.label}: até ${show(max as number)}`
    }
    case "date-range":
      return `${config.label}: ${formatRangeLabel(value as { from?: string; to?: string })}`
  }
}

export interface ActiveFilter {
  id: string
  text: string
}

export const activeFilters = <T>(specs: readonly FilterSpec<T>[], filters: FilterState): ActiveFilter[] =>
  specs.filter((s) => isFilterActive(filters[s.id])).map((s) => ({ id: s.id, text: describeFilter(s.config, filters[s.id]) }))

/** Remove um filtro sem tocar nos demais. */
export function withoutFilter(filters: FilterState, id: string): FilterState {
  const { [id]: _removed, ...rest } = filters
  return rest
}

/** Atualiza um filtro; valor vazio remove a chave (o estado só guarda o que está ativo). */
export function withFilter(filters: FilterState, id: string, value: FilterValue | undefined): FilterState {
  return value !== undefined && isFilterActive(value) ? { ...filters, [id]: value } : withoutFilter(filters, id)
}
