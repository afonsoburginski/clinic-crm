import type { Row } from "./backend-mappers"

/** Visão salva de uma tabela, como a API devolve (sempre do usuário da sessão). */
export interface TableView {
  name: string
  pageSize: number | null
  sort: { id: string; desc: boolean }[]
  hiddenColumns: string[]
  columnOrder: string[]
  filters: Record<string, unknown>
  isDefault: boolean
  updatedAt: string
}

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value)
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [])

export function toTableView(raw: Row): TableView {
  const sort = Array.isArray(raw.sort)
    ? raw.sort.flatMap((rule) => (isRow(rule) && typeof rule.id === "string" ? [{ id: rule.id, desc: rule.desc === true }] : []))
    : []
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    pageSize: typeof raw.pageSize === "number" && Number.isFinite(raw.pageSize) ? raw.pageSize : null,
    sort,
    hiddenColumns: strings(raw.hiddenColumns),
    columnOrder: strings(raw.columnOrder),
    filters: isRow(raw.filters) ? raw.filters : {},
    isDefault: raw.isDefault === true,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  }
}
