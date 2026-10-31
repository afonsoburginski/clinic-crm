import type {
  AuditEventView,
  CatalogFilters,
  CatalogItem,
  CatalogRepository,
  CatalogResource,
  InsertCatalogRecordCommand,
  ListAuditEventsQuery,
  PatchCatalogRecordCommand,
} from "@/application/ports/catalog"

export class FakeCatalogRepository implements CatalogRepository {
  items: Record<string, CatalogItem[]> = {}
  events: AuditEventView[] = []
  listed?: { clinicId: string; resource: CatalogResource; filters: CatalogFilters }
  auditQuery?: ListAuditEventsQuery
  inserted: InsertCatalogRecordCommand[] = []
  patched: PatchCatalogRecordCommand[] = []

  async listItems(clinicId: string, resource: CatalogResource, filters: CatalogFilters) {
    this.listed = { clinicId, resource, filters }
    return this.items[resource] ?? []
  }
  async getItem(_clinicId: string, resource: CatalogResource, id: string) {
    return (this.items[resource] ?? []).find((item) => item.id === id)
  }
  async listAuditEvents(query: ListAuditEventsQuery) {
    this.auditQuery = query
    return this.events
  }
  async insert(command: InsertCatalogRecordCommand) {
    this.inserted.push(command)
    return { id: "new", ...command.payload }
  }
  async patch(command: PatchCatalogRecordCommand) {
    this.patched.push(command)
    const current = (this.items[command.resource] ?? []).find((item) => item.id === command.id)
    return current && { ...current, ...command.patch }
  }
}
