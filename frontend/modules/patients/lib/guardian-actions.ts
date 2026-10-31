import { PencilLine } from "lucide-react"

import type { Guardian } from "@/domain/types"
import type { EntityAction } from "@/shared/ui/entity-menu"

/** Ações de um responsável (linha da lista de responsáveis). Vínculos nascem na ficha do paciente. */
export function guardianActions(guardian: Guardian, handlers: { onEdit: () => void }): EntityAction[] {
  return [
    { id: "edit", label: "Editar responsável", icon: PencilLine, permission: "guardians:write", onSelect: handlers.onEdit },
    { id: "copy-phone", label: "Copiar telefone", kind: "copy", text: guardian.phone, group: "clipboard" },
    { id: "copy-email", label: "Copiar e-mail", kind: "copy", text: guardian.email ?? "", hidden: !guardian.email, group: "clipboard" },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: guardian.id, group: "clipboard" },
  ]
}

/** Ações de um vínculo responsável–paciente (ficha do paciente). Remover encerra liberações de documentos ativas. */
export function guardianLinkActions(
  link: { id: string; guardianName: string; patientName: string },
  handlers: { onEdit: () => void; onRemove: () => void | Promise<unknown> }
): EntityAction[] {
  return [
    { id: "edit", label: "Editar vínculo", icon: PencilLine, permission: "guardians:write", onSelect: handlers.onEdit },
    { id: "copy-id", label: "Copiar ID do vínculo", kind: "copy", text: link.id, group: "clipboard" },
    {
      id: "remove",
      label: "Remover vínculo",
      permission: "guardians:write",
      destructive: true,
      confirm: {
        title: "Remover vínculo?",
        description: `${link.guardianName} deixará de ser responsável por ${link.patientName}. As liberações de documentos ativas deste responsável também são encerradas. O cadastro do responsável continua existindo.`,
        confirmLabel: "Remover vínculo",
      },
      onSelect: handlers.onRemove,
    },
  ]
}
