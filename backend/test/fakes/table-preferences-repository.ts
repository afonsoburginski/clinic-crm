import type {
  SaveTableViewCommand,
  SaveTableViewResult,
  TablePreferenceRepository,
  TableScope,
  TableViewRecord,
} from "@/application/ports/table-preferences"

const keyOf = (scope: TableScope) => `${scope.clinicId}|${scope.userId}|${scope.tableKey}`

export class FakeTablePreferenceRepository implements TablePreferenceRepository {
  views = new Map<string, TableViewRecord[]>()
  scopes: TableScope[] = []

  async list(scope: TableScope) {
    this.scopes.push(scope)
    return [...(this.views.get(keyOf(scope)) ?? [])]
  }

  async save({ scope, name, view, maxViews }: SaveTableViewCommand): Promise<SaveTableViewResult> {
    this.scopes.push(scope)
    const current = this.views.get(keyOf(scope)) ?? []
    const exists = current.some((item) => item.name === name)
    if (!exists && current.filter((item) => item.name !== name).length >= maxViews) return { outcome: "limit_reached" }
    const record: TableViewRecord = { name, ...view, updatedAt: "2026-01-01T00:00:00.000Z" }
    const others = current.filter((item) => item.name !== name).map((item) => (view.isDefault ? { ...item, isDefault: false } : item))
    this.views.set(keyOf(scope), [...others, record])
    return { outcome: "saved", view: record }
  }

  async remove(scope: TableScope, name: string) {
    this.scopes.push(scope)
    const current = this.views.get(keyOf(scope)) ?? []
    this.views.set(keyOf(scope), current.filter((item) => item.name !== name))
    return current.some((item) => item.name === name)
  }
}
