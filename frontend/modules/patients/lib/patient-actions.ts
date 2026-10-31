import { CalendarPlus, ExternalLink, PencilLine, UserCheck, UserX } from "lucide-react"

import type { Patient, PatientStatus } from "@/domain/types"
import type { EntityAction } from "@/shared/ui/entity-menu"

export interface PatientActionHandlers {
  onView: () => void
  onEdit: () => void
  onSchedule: () => void
  onSetStatus: (status: PatientStatus) => void | Promise<unknown>
}

/**
 * Ações de um paciente (linha da lista e cabeçalho da ficha). "Excluir" não existe: o cadastro é inativado e continua
 * no histórico. Com `inDetail` (já na própria ficha) o "Ver" some.
 */
export function patientActions(patient: Patient, handlers: PatientActionHandlers & { inDetail?: boolean }): EntityAction[] {
  const name = patient.socialName || patient.fullName
  return [
    { id: "view", label: "Ver ficha", icon: ExternalLink, hidden: handlers.inDetail, onSelect: handlers.onView },
    { id: "edit", label: "Editar cadastro", icon: PencilLine, permission: "patients:write", onSelect: handlers.onEdit },
    { id: "schedule", label: "Agendar atendimento", icon: CalendarPlus, permission: "appointments:write", hidden: patient.status !== "active", onSelect: handlers.onSchedule },
    { id: "copy-code", label: "Copiar código", kind: "copy", text: patient.code, group: "clipboard" },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: patient.id, group: "clipboard" },
    patient.status === "active"
      ? {
          id: "deactivate",
          label: "Inativar paciente",
          icon: UserX,
          permission: "patients:write",
          destructive: true,
          confirm: {
            title: `Inativar ${name}?`,
            description: "O paciente deixa de aparecer em novos agendamentos. O cadastro e o histórico são preservados e ele pode ser reativado depois.",
            confirmLabel: "Inativar",
          },
          onSelect: () => handlers.onSetStatus("inactive"),
        }
      : { id: "reactivate", label: "Reativar paciente", icon: UserCheck, permission: "patients:write", group: "status", onSelect: () => handlers.onSetStatus("active") },
  ]
}
