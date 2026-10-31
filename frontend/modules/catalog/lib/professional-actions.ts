import { ExternalLink, PencilLine, UserCheck, UserX } from "lucide-react"

import type { ProfessionalInput } from "@/domain/schemas"
import type { Professional } from "@/domain/types"
import type { EntityAction } from "@/shared/ui/entity-menu"

/** Corpo do cadastro de profissional (o PATCH preserva grade e indisponibilidades). */
export function professionalToInput(professional: Professional, patch: Partial<ProfessionalInput> = {}): ProfessionalInput {
  return {
    name: professional.name,
    email: professional.email,
    phone: professional.phone ?? "",
    registry: professional.registry ?? "",
    specialtyIds: professional.specialtyIds,
    active: professional.active,
    ...patch,
  }
}

export interface ProfessionalActionHandlers {
  onView: () => void
  onEdit: () => void
  onSetActive: (active: boolean) => void | Promise<unknown>
}

/** Ações de um profissional: nunca excluído — inativado, para preservar a agenda e o histórico. */
export function professionalActions(professional: Professional, handlers: ProfessionalActionHandlers & { inDetail?: boolean }): EntityAction[] {
  return [
    { id: "view", label: "Ver perfil e agenda", icon: ExternalLink, hidden: handlers.inDetail, onSelect: handlers.onView },
    { id: "edit", label: "Editar dados", icon: PencilLine, permission: "professionals:manage", onSelect: handlers.onEdit },
    { id: "copy-email", label: "Copiar e-mail", kind: "copy", text: professional.email, hidden: !professional.email, group: "clipboard" },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: professional.id, group: "clipboard" },
    professional.active
      ? {
          id: "deactivate",
          label: "Inativar profissional",
          icon: UserX,
          permission: "professionals:manage",
          destructive: true,
          confirm: {
            title: `Inativar ${professional.name}?`,
            description: "O profissional deixa de receber novos agendamentos. A agenda e o histórico são preservados e ele pode ser reativado depois.",
            confirmLabel: "Inativar",
          },
          onSelect: () => handlers.onSetActive(false),
        }
      : { id: "reactivate", label: "Reativar profissional", icon: UserCheck, permission: "professionals:manage", group: "status", onSelect: () => handlers.onSetActive(true) },
  ]
}
