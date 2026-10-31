import { Copy, PencilLine, Power, PowerOff } from "lucide-react"

import type { RoomInput, ServiceInput } from "@/domain/schemas"
import type { Room, Service } from "@/domain/types"
import type { EntityAction } from "@/shared/ui/entity-menu"

export function serviceToInput(service: Service, patch: Partial<ServiceInput> = {}): ServiceInput {
  return {
    name: service.name,
    specialtyId: service.specialtyId,
    durationMin: service.durationMin,
    referencePrice: service.referencePriceCents / 100,
    requiresRoom: service.requiresRoom,
    active: service.active,
    ...patch,
  }
}

export function roomToInput(room: Room, patch: Partial<RoomInput> = {}): RoomInput {
  return { name: room.name, capacity: room.capacity, exclusive: room.exclusive, active: room.active, notes: room.notes ?? "", ...patch }
}

interface CatalogHandlers {
  onEdit: () => void
  /** Abre o diálogo de criação já preenchido com os dados do item (nenhuma chamada nova à API). */
  onDuplicate: () => void
  onSetActive: (active: boolean) => void | Promise<unknown>
}

function catalogActions(
  item: { id: string; name: string; active: boolean },
  noun: "serviço" | "sala",
  permission: "services:manage" | "rooms:manage",
  handlers: CatalogHandlers
): EntityAction[] {
  const feminine = noun === "sala"
  return [
    { id: "edit", label: `Editar ${noun}`, icon: PencilLine, permission, onSelect: handlers.onEdit },
    { id: "duplicate", label: "Duplicar", icon: Copy, permission, onSelect: handlers.onDuplicate },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: item.id, group: "clipboard" },
    item.active
      ? {
          id: "deactivate",
          label: `Inativar ${noun}`,
          icon: PowerOff,
          permission,
          destructive: true,
          confirm: {
            title: `Inativar ${item.name}?`,
            description: `${feminine ? "A sala" : "O serviço"} deixa de ser oferecid${feminine ? "a" : "o"} em novos agendamentos. O histórico é preservado e ${feminine ? "ela" : "ele"} pode ser reativad${feminine ? "a" : "o"} depois.`,
            confirmLabel: "Inativar",
          },
          onSelect: () => handlers.onSetActive(false),
        }
      : { id: "reactivate", label: `Reativar ${noun}`, icon: Power, permission, group: "status", onSelect: () => handlers.onSetActive(true) },
  ]
}

export const serviceActions = (service: Service, handlers: CatalogHandlers) => catalogActions(service, "serviço", "services:manage", handlers)
export const roomActions = (room: Room, handlers: CatalogHandlers) => catalogActions(room, "sala", "rooms:manage", handlers)

/** Nome sugerido para a cópia ("Sala 1 (cópia)"). */
export const copyName = (name: string) => `${name} (cópia)`
