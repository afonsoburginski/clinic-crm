import type { TableView } from "@/shared/api/table-preferences-mappers"

import { isFilterActive, normalizeFilterValue } from "./filters"
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, emptyState, type DataTableState, type FilterSpec, type FilterState, type FilterValue, type SortRule } from "./types"

/**
 * Visões salvas ↔ estado da tabela. A visão `default` guarda as preferências de trabalho (tamanho da página,
 * ordenação, colunas); as demais carregam também a busca e os filtros. O servidor guarda tudo por usuário.
 */
export const DEFAULT_VIEW = "default"
/** A busca global viaja junto dos filtros (o servidor aceita só texto, número, lista ou objeto plano). */
export const SEARCH_KEY = "_search"

export interface ViewContext<T> {
  columnIds: readonly string[]
  specs: readonly FilterSpec<T>[]
}

/** O que a API recebe no PUT de uma visão. */
export interface ViewPayload {
  pageSize: number | null
  sort: SortRule[]
  hiddenColumns: string[]
  columnOrder: string[]
  filters: Record<string, FilterValue | null>
  isDefault?: boolean
}

/** Preferências de trabalho: nada de busca nem filtros (abrir a tela com um filtro antigo confunde). */
export const workingPayload = (state: DataTableState): ViewPayload => ({
  pageSize: state.pageSize,
  sort: state.sort.map(({ id, desc }) => ({ id, desc })),
  hiddenColumns: [...state.hiddenColumns],
  columnOrder: [...state.columnOrder],
  filters: {},
})

/** Visão nomeada: tudo, inclusive a busca e os filtros ativos. */
export function viewPayload(state: DataTableState, isDefault = false): ViewPayload {
  const filters: Record<string, FilterValue | null> = {}
  for (const [id, value] of Object.entries(state.filters)) if (isFilterActive(value)) filters[id] = value
  const search = state.search.trim()
  if (search) filters[SEARCH_KEY] = search
  return { ...workingPayload(state), filters, ...(isDefault ? { isDefault: true } : {}) }
}

const unique = (list: readonly string[], allowed: readonly string[]) => [...new Set(list.filter((id) => allowed.includes(id)))]

/**
 * Aplica uma visão sobre o estado atual. Colunas e filtros que a tabela não conhece (coluna removida, visão
 * antiga) são descartados; filtros com forma inválida também. A página volta à primeira.
 */
export function applyView<T>(base: DataTableState, view: Pick<TableView, "pageSize" | "sort" | "hiddenColumns" | "columnOrder" | "filters">, ctx: ViewContext<T>): DataTableState {
  const filters: FilterState = {}
  for (const spec of ctx.specs) {
    const normalized = normalizeFilterValue(spec.config, view.filters[spec.id])
    if (normalized !== undefined) filters[spec.id] = normalized
  }
  const search = view.filters[SEARCH_KEY]
  return {
    ...base,
    search: typeof search === "string" ? search : "",
    filters,
    sort: view.sort.filter((rule) => ctx.columnIds.includes(rule.id)),
    pageIndex: 0,
    pageSize: view.pageSize && PAGE_SIZES.includes(view.pageSize as (typeof PAGE_SIZES)[number]) ? view.pageSize : base.pageSize,
    hiddenColumns: unique(view.hiddenColumns, ctx.columnIds),
    columnOrder: unique(view.columnOrder, ctx.columnIds),
  }
}

/** Só as preferências de trabalho de uma visão (sem busca e sem filtros), para sobrepor ao padrão da tela. */
const working = (view: TableView): TableView => ({ ...view, filters: {} })

/**
 * Estado inicial ao abrir a tela: padrão da tela → preferências de trabalho (`default`) → visão marcada como
 * inicial (que traz também busca e filtros). Sem nada salvo, vale o padrão da tela.
 */
export function resolveInitialState<T>(views: readonly TableView[], defaults: DataTableState, ctx: ViewContext<T>): DataTableState {
  let state = defaults
  const prefs = views.find((v) => v.name === DEFAULT_VIEW)
  if (prefs) {
    const applied = applyView(state, working(prefs), ctx)
    // `applyView` zera filtros e busca: preservamos os do padrão da tela.
    state = { ...applied, search: defaults.search, filters: defaults.filters }
  }
  const initial = views.find((v) => v.isDefault && v.name !== DEFAULT_VIEW)
  if (initial) state = applyView(state, initial, ctx)
  return state
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i])

/** As preferências de trabalho mudaram? (decide se vale gravar a visão `default`). */
export function workingChanged(a: DataTableState, b: DataTableState): boolean {
  return (
    a.pageSize !== b.pageSize ||
    !sameList(a.hiddenColumns, b.hiddenColumns) ||
    !sameList(a.columnOrder, b.columnOrder) ||
    a.sort.length !== b.sort.length ||
    a.sort.some((rule, i) => rule.id !== b.sort[i].id || rule.desc !== b.sort[i].desc)
  )
}

export const viewName = (raw: string) => raw.trim().replace(/\s+/g, " ").slice(0, 40)

export const defaultsOf = (overrides: Partial<DataTableState> = {}) => emptyState({ pageSize: DEFAULT_PAGE_SIZE, ...overrides })
