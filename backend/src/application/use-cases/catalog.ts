import type {
  AddProfessionalUnavailabilityCommand,
  AuditEntry,
  CatalogItem,
  CatalogPayload,
  CatalogQueryRepository,
  CatalogRepository,
  CatalogResource,
  CreateCatalogItemCommand,
  GetCatalogItemQuery,
  GetSettingsQuery,
  ListAuditEventsQuery,
  ListCatalogItemsQuery,
  RemoveProfessionalUnavailabilityCommand,
  SaveSettingsCommand,
  UpdateCatalogItemCommand,
  UpdateProfessionalScheduleCommand,
} from "@/application/ports/catalog"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function payloadOf(body: unknown): CatalogPayload {
  if (!isRecord(body)) throw new Error("validation")
  return body
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function auditEntry(action: AuditEntry["action"], resource: CatalogResource, payload: CatalogPayload): AuditEntry {
  return {
    action,
    summary: `Alterou ${resource}`,
    changes: Object.keys(payload).map((field) => ({ field, from: null, to: null })),
  }
}

async function latestSettings(repository: CatalogQueryRepository, clinicId: string): Promise<CatalogItem | undefined> {
  return (await repository.listItems(clinicId, "settings", {}))[0]
}

export function createCatalogQueries(repository: CatalogQueryRepository) {
  return {
    listItems: (query: ListCatalogItemsQuery) => repository.listItems(query.clinicId, query.kind, query.filters),
    async getItem(query: GetCatalogItemQuery): Promise<CatalogItem> {
      const item = await repository.getItem(query.clinicId, query.kind, query.id)
      if (!item) throw new Error("not_found")
      return item
    },
    async getSettings(query: GetSettingsQuery): Promise<CatalogPayload> {
      return (await latestSettings(repository, query.clinicId)) ?? {}
    },
    listAuditEvents: (query: ListAuditEventsQuery) => repository.listAuditEvents(query),
  }
}

export function createCatalogCommands(repository: CatalogRepository) {
  async function insert(clinicId: string, resource: CatalogResource, actorId: string, body: unknown) {
    const payload = payloadOf(body)
    return repository.insert({
      clinicId,
      resource,
      actorId,
      payload: { ...payload, createdBy: payload.createdBy ?? actorId, status: payload.status ?? "draft" },
      audit: auditEntry("create", resource, payload),
    })
  }

  async function patch(clinicId: string, resource: CatalogResource, id: string, actorId: string, changes: CatalogPayload) {
    const item = await repository.patch({ clinicId, resource, id, actorId, patch: changes, audit: auditEntry("update", resource, changes) })
    if (!item) throw new Error("not_found")
    return item
  }

  return {
    createItem: async (command: CreateCatalogItemCommand) => insert(command.clinicId, command.kind, command.actorId, command.body),
    updateItem: async (command: UpdateCatalogItemCommand) =>
      patch(command.clinicId, command.kind, command.id, command.actorId, payloadOf(command.body)),
    async updateProfessionalSchedule(command: UpdateProfessionalScheduleCommand) {
      const body = payloadOf(command.body)
      if (!("schedule" in body)) throw new Error("validation")
      return patch(command.clinicId, "professional", command.professionalId, command.actorId, { schedule: body.schedule })
    },
    /** Appends the new entry to the professional's currently stored unavailabilities. */
    async addProfessionalUnavailability(command: AddProfessionalUnavailabilityCommand) {
      const entry = payloadOf(command.body)
      const professional = await repository.getItem(command.clinicId, "professional", command.professionalId)
      if (!professional) throw new Error("not_found")
      const stored = listOf(professional.unavailabilities)
      return patch(command.clinicId, "professional", professional.id, command.actorId, { unavailabilities: [...stored, entry] })
    },
    async removeProfessionalUnavailability(command: RemoveProfessionalUnavailabilityCommand) {
      const professional = await repository.getItem(command.clinicId, "professional", command.professionalId)
      if (!professional) throw new Error("not_found")
      const remaining = listOf(professional.unavailabilities).filter(
        (entry) => !(isRecord(entry) && entry.id === command.unavailabilityId),
      )
      return patch(command.clinicId, "professional", professional.id, command.actorId, { unavailabilities: remaining })
    },
    async saveSettings(command: SaveSettingsCommand) {
      const payload = payloadOf(command.body)
      const current = await latestSettings(repository, command.clinicId)
      return current
        ? patch(command.clinicId, "settings", current.id, command.actorId, payload)
        : insert(command.clinicId, "settings", command.actorId, payload)
    },
  }
}

export function createCatalogUseCases(repository: CatalogRepository) {
  return { queries: createCatalogQueries(repository), commands: createCatalogCommands(repository) }
}

export type CatalogUseCases = ReturnType<typeof createCatalogUseCases>
