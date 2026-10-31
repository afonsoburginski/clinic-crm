import type { FilterValue, SortRule, TableViewInput } from "@/domain/table-preferences"

/** Preferences are always scoped to the signed-in user of one clinic and one table. */
export interface TableScope {
  clinicId: string
  userId: string
  tableKey: string
}

export interface TableViewRecord {
  name: string
  pageSize: number | null
  sort: SortRule[]
  hiddenColumns: string[]
  columnOrder: string[]
  filters: Record<string, FilterValue>
  isDefault: boolean
  updatedAt: string
}

export interface SaveTableViewCommand {
  scope: TableScope
  name: string
  view: TableViewInput
  /** A new view is refused once the user already has this many for the table. */
  maxViews: number
}

export type SaveTableViewResult = { outcome: "saved"; view: TableViewRecord } | { outcome: "limit_reached" }

export interface TablePreferenceRepository {
  list(scope: TableScope): Promise<TableViewRecord[]>
  save(command: SaveTableViewCommand): Promise<SaveTableViewResult>
  /** `false` when the user had no such view. */
  remove(scope: TableScope, name: string): Promise<boolean>
}
