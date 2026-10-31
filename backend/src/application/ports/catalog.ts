export type CatalogKind = "specialty" | "service" | "room" | "professional"
export type CatalogResource = CatalogKind | "settings"
export type CatalogPayload = Record<string, unknown>
export interface CatalogItem { id: string; [field: string]: unknown }

export interface AuditFieldChange { field: string; from: null; to: null }
export interface AuditEntry { action: "create" | "update"; summary: string; changes: AuditFieldChange[] }
export interface AuditEventView {
  actorId: string
  at: Date
  action: string
  resource: string
  resourceId: string
  summary: string
  changes: unknown
}

export interface CatalogFilters { patientId?: string; status?: string; from?: string; to?: string }

export interface ListCatalogItemsQuery { clinicId: string; kind: CatalogKind; filters: CatalogFilters }
export interface GetCatalogItemQuery { clinicId: string; kind: CatalogKind; id: string }
export interface GetSettingsQuery { clinicId: string }
export interface ListAuditEventsQuery { clinicId: string; resource?: string; actorId?: string }

/** `body` is the raw request payload; use cases validate it before it reaches the repository. */
export interface CreateCatalogItemCommand { clinicId: string; kind: CatalogKind; actorId: string; body: unknown }
export interface UpdateCatalogItemCommand { clinicId: string; kind: CatalogKind; id: string; actorId: string; body: unknown }
export interface UpdateProfessionalScheduleCommand { clinicId: string; professionalId: string; actorId: string; body: unknown }
export interface AddProfessionalUnavailabilityCommand { clinicId: string; professionalId: string; actorId: string; body: unknown }
export interface RemoveProfessionalUnavailabilityCommand { clinicId: string; professionalId: string; actorId: string; unavailabilityId: string }
export interface SaveSettingsCommand { clinicId: string; actorId: string; body: unknown }

export interface InsertCatalogRecordCommand {
  clinicId: string
  resource: CatalogResource
  actorId: string
  payload: CatalogPayload
  audit: AuditEntry
}

/** `patch` is shallow-merged over the stored payload under a row lock. */
export interface PatchCatalogRecordCommand {
  clinicId: string
  resource: CatalogResource
  id: string
  actorId: string
  patch: CatalogPayload
  audit: AuditEntry
}

export interface CatalogQueryRepository {
  listItems(clinicId: string, resource: CatalogResource, filters: CatalogFilters): Promise<CatalogItem[]>
  getItem(clinicId: string, resource: CatalogResource, id: string): Promise<CatalogItem | undefined>
  listAuditEvents(query: ListAuditEventsQuery): Promise<AuditEventView[]>
}

export interface CatalogCommandRepository {
  insert(command: InsertCatalogRecordCommand): Promise<CatalogItem>
  patch(command: PatchCatalogRecordCommand): Promise<CatalogItem | undefined>
}

export interface CatalogRepository extends CatalogQueryRepository, CatalogCommandRepository {}
