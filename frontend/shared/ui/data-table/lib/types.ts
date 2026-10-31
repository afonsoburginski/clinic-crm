import type { DateRangeValue } from "@/shared/ui/date-range-picker/lib/range"

export interface FilterOption {
  value: string
  label: string
}

export interface RangeFilterValue {
  min?: number
  max?: number
}

/** `select`: texto; `multiselect`/`status`: lista; `range`/`money`: faixa (`money` em centavos); `date-range`: período. */
export type FilterValue = string | string[] | RangeFilterValue | DateRangeValue

type Accessor<T, V> = (row: T) => V | null | undefined

/** Filtro declarativo de uma coluna: o tipo decide o controle da toolbar e o predicado em memória. */
export type FilterConfig<T> =
  | { kind: "select"; label: string; options: FilterOption[]; value: Accessor<T, string>; allLabel?: string }
  | { kind: "multiselect"; label: string; options: FilterOption[]; value: Accessor<T, string | string[]> }
  | { kind: "status"; label: string; options: FilterOption[]; value: Accessor<T, string | string[]> }
  | { kind: "range"; label: string; value: Accessor<T, number>; unit?: string }
  | { kind: "money"; label: string; value: Accessor<T, number> }
  | { kind: "date-range"; label: string; value: Accessor<T, string> }

export type FilterKind = FilterConfig<unknown>["kind"]

/** Uma coluna com filtro, vista pela lógica pura (sem TanStack). */
export interface FilterSpec<T> {
  id: string
  config: FilterConfig<T>
}

export type FilterState = Record<string, FilterValue>

export interface SortRule {
  id: string
  desc: boolean
}

/** Estado completo da tabela (o que uma visão salva restaura). */
export interface DataTableState {
  search: string
  filters: FilterState
  sort: SortRule[]
  pageIndex: number
  pageSize: number
  hiddenColumns: string[]
  columnOrder: string[]
}

export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZES = [10, 20, 50, 100] as const

export const emptyState = (overrides: Partial<DataTableState> = {}): DataTableState => ({
  search: "",
  filters: {},
  sort: [],
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  hiddenColumns: [],
  columnOrder: [],
  ...overrides,
})
