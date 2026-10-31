/** Pure rules of the per-user table preferences (saved views): who may name what, and how big a view can be. */

export const TABLE_KEY = /^[a-z0-9-]{1,60}$/
export const DEFAULT_VIEW = "default"
export const MAX_VIEW_NAME_LENGTH = 40
export const MAX_VIEWS_PER_TABLE = 20
export const MAX_PAGE_SIZE = 200
export const MAX_SORT_RULES = 5
export const MAX_COLUMNS = 60
export const MAX_FILTERS = 40
const MAX_KEY_LENGTH = 60
const MAX_TEXT_LENGTH = 200
const MAX_LIST_LENGTH = 100
/** Serialized size of sort + columns + filters; keeps one row small. */
export const MAX_VIEW_BYTES = 16 * 1024

const COLUMN_KEY = /^[A-Za-z0-9_.$-]{1,60}$/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

export interface SortRule { id: string; desc: boolean }

/** A filter value is JSON a table can restore: text, numbers, booleans, lists of those, or a flat object of those (ranges). */
export type FilterValue = string | number | boolean | null | Array<string | number | boolean> | { [key: string]: string | number | boolean | null }

export interface TableViewInput {
  pageSize: number | null
  sort: SortRule[]
  hiddenColumns: string[]
  columnOrder: string[]
  filters: Record<string, FilterValue>
  isDefault: boolean
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; detail: string }

const fail = (detail: string): { ok: false; detail: string } => ({ ok: false, detail })
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length <= MAX_TEXT_LENGTH)

export function parseTableKey(value: unknown): Parsed<string> {
  return typeof value === "string" && TABLE_KEY.test(value) ? { ok: true, value } : fail("Identificador de tabela inválido.")
}

export function parseViewName(value: unknown): Parsed<string> {
  const name = typeof value === "string" ? value.trim() : ""
  if (!name || name.length > MAX_VIEW_NAME_LENGTH || CONTROL_CHARACTERS.test(name)) {
    return fail(`Informe um nome de visão de 1 a ${MAX_VIEW_NAME_LENGTH} caracteres.`)
  }
  return { ok: true, value: name }
}

function columnList(value: unknown, label: string): Parsed<string[]> {
  if (value === undefined) return { ok: true, value: [] }
  if (!Array.isArray(value) || value.length > MAX_COLUMNS || value.some((c) => typeof c !== "string" || !COLUMN_KEY.test(c))) {
    return fail(`Lista de colunas inválida (${label}).`)
  }
  return { ok: true, value: [...new Set(value as string[])] }
}

function sortRules(value: unknown): Parsed<SortRule[]> {
  if (value === undefined) return { ok: true, value: [] }
  if (!Array.isArray(value) || value.length > MAX_SORT_RULES) return fail("Ordenação inválida.")
  const rules: SortRule[] = []
  for (const rule of value) {
    if (!isRecord(rule) || typeof rule.id !== "string" || !COLUMN_KEY.test(rule.id) || typeof rule.desc !== "boolean") {
      return fail("Ordenação inválida.")
    }
    if (!rules.some((r) => r.id === rule.id)) rules.push({ id: rule.id, desc: rule.desc })
  }
  return { ok: true, value: rules }
}

function filterValue(value: unknown): FilterValue | undefined {
  if (value === null || isScalar(value)) return value
  if (Array.isArray(value)) {
    return value.length <= MAX_LIST_LENGTH && value.every(isScalar) ? (value as Array<string | number | boolean>) : undefined
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length > 8 || entries.some(([key, item]) => !COLUMN_KEY.test(key) || (item !== null && !isScalar(item)))) return undefined
    return Object.fromEntries(entries) as { [key: string]: string | number | boolean | null }
  }
  return undefined
}

function filterMap(value: unknown): Parsed<Record<string, FilterValue>> {
  if (value === undefined) return { ok: true, value: {} }
  if (!isRecord(value)) return fail("Filtros inválidos.")
  const entries = Object.entries(value)
  if (entries.length > MAX_FILTERS) return fail("Filtros demais na visão.")
  const filters: Record<string, FilterValue> = {}
  for (const [key, raw] of entries) {
    const parsed = filterValue(raw)
    if (!COLUMN_KEY.test(key) || parsed === undefined) return fail("Filtros inválidos.")
    filters[key] = parsed
  }
  return { ok: true, value: filters }
}

/** Normalizes the body of a view; anything the table could not restore is refused rather than stored. */
export function parseViewInput(body: unknown, viewName: string): Parsed<TableViewInput> {
  if (!isRecord(body)) return fail("Dados inválidos.")
  const { pageSize, isDefault } = body
  if (pageSize !== undefined && pageSize !== null && (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE)) {
    return fail(`O tamanho da página precisa estar entre 1 e ${MAX_PAGE_SIZE}.`)
  }
  if (isDefault !== undefined && typeof isDefault !== "boolean") return fail("Dados inválidos.")
  if (isDefault && viewName === DEFAULT_VIEW) return fail("A visão padrão de preferências não pode ser marcada como inicial.")
  const sort = sortRules(body.sort)
  if (!sort.ok) return sort
  const hidden = columnList(body.hiddenColumns, "ocultas")
  if (!hidden.ok) return hidden
  const order = columnList(body.columnOrder, "ordem")
  if (!order.ok) return order
  const filters = filterMap(body.filters)
  if (!filters.ok) return filters
  const value: TableViewInput = {
    pageSize: typeof pageSize === "number" ? pageSize : null,
    sort: sort.value,
    hiddenColumns: hidden.value,
    columnOrder: order.value,
    filters: filters.value,
    isDefault: isDefault === true,
  }
  const bytes = new TextEncoder().encode(JSON.stringify([value.sort, value.hiddenColumns, value.columnOrder, value.filters])).length
  if (bytes > MAX_VIEW_BYTES) return fail("A visão é grande demais para ser salva.")
  return { ok: true, value }
}
