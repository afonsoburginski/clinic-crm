import type { Row } from "./backend-mappers"
import { items, seg } from "./helpers"
import { http } from "./http-client"
import { toTableView, type TableView } from "./table-preferences-mappers"

/** Visões salvas das tabelas (`/preferences/tables`): sempre as do usuário da sessão, no PostgreSQL. */
export interface TableViewInput {
  pageSize: number | null
  sort: { id: string; desc: boolean }[]
  hiddenColumns: string[]
  columnOrder: string[]
  filters: Record<string, unknown>
  isDefault?: boolean
}

const base = (tableKey: string) => `/preferences/tables/${seg(tableKey)}`

export const tablePreferencesApi = {
  async list(tableKey: string): Promise<TableView[]> {
    return (await items(base(tableKey))).map(toTableView)
  },

  async save(tableKey: string, name: string, input: TableViewInput): Promise<TableView> {
    return toTableView(
      await http.put<Row>(`${base(tableKey)}/views/${seg(name)}`, {
        body: input,
        errors: { 409: "Limite de visões salvas atingido. Exclua uma visão para criar outra." },
      })
    )
  },

  async remove(tableKey: string, name: string): Promise<void> {
    await http.delete(`${base(tableKey)}/views/${seg(name)}`, { errors: { 404: "Visão não encontrada." } })
  },
}
