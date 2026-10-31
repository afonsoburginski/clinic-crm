import { ChevronsDownUp } from "lucide-react"

import type { AuditEntry } from "@/domain/types"
import type { EntityAction } from "@/shared/ui/entity-menu"

/** Ações de um evento de auditoria (imutável): ver os campos alterados e copiar identificadores. Sem edição nem exclusão. */
export function auditActions(entry: AuditEntry, handlers: { onToggleDetails: () => void; detailsOpen: boolean }): EntityAction[] {
  const hasDetails = !!entry.changes && Object.keys(entry.changes).length > 0
  return [
    { id: "details", label: handlers.detailsOpen ? "Recolher detalhes" : "Ver detalhes", icon: ChevronsDownUp, hidden: !hasDetails, onSelect: handlers.onToggleDetails },
    { id: "copy-id", label: "Copiar ID do evento", kind: "copy", text: entry.id, group: "clipboard" },
    { id: "copy-resource-id", label: "Copiar ID do recurso", kind: "copy", text: entry.resourceId, hidden: !entry.resourceId, group: "clipboard" },
    { id: "copy-summary", label: "Copiar descrição", kind: "copy", text: entry.summary, successMessage: "Descrição copiada.", group: "clipboard" },
  ]
}
