import { CalendarClock, CircleCheck, ExternalLink, PencilLine, User } from "lucide-react"

import { availableTransitions, STATUS_LABELS, TRANSITION_ACTION_LABELS } from "@/domain/appointment-status"
import { can } from "@/domain/permissions"
import type { Appointment, AppointmentStatus, User as SessionUser } from "@/domain/types"
import { formatDateLong, formatTime } from "@/shared/lib/format"
import type { EntityAction } from "@/shared/ui/entity-menu"

export interface AppointmentActionHandlers {
  /** Quem está logado: as transições dependem do papel e de a agenda ser a própria. */
  user: SessionUser | null | undefined
  /** Cancelar exige motivo quando a clínica configurou assim (RN-AGD). */
  requireCancelReason: boolean
  onChangeStatus: (to: AppointmentStatus, reason?: string) => void | Promise<unknown>
  /** Abre o detalhe (painel lateral da agenda). Sem ele, o item "Ver detalhes" some. */
  onView?: () => void
  onReschedule?: () => void
  /** Abre a ficha do paciente. */
  onOpenPatient?: () => void
}

/** "seg., 3 de novembro de 2026, 09:00–09:50" — o que "Copiar horário" leva para a área de transferência. */
export function appointmentTimeText(appointment: Pick<Appointment, "start" | "end">) {
  return `${formatDateLong(appointment.start)}, ${formatTime(appointment.start)}–${formatTime(appointment.end)}`
}

/**
 * Ações de um card da agenda (atendimento ou bloqueio). As mudanças de situação seguem `availableTransitions`
 * (as mesmas do painel de detalhe): só aparecem as transições que a máquina de estados e o papel permitem.
 */
export function appointmentActions(appointment: Appointment, handlers: AppointmentActionHandlers): EntityAction[] {
  const isBlock = appointment.kind === "block"
  const transitions = availableTransitions(handlers.user, appointment)
  const forward = transitions.filter((to) => to !== "cancelled")
  const canCancel = transitions.includes("cancelled")
  const closed = appointment.status === "completed" || appointment.status === "cancelled" || appointment.status === "no_show"
  const canEdit = can(handlers.user, "appointments:write") && !closed && appointment.status !== "in_progress"

  return [
    { id: "view", label: "Ver detalhes", icon: ExternalLink, hidden: !handlers.onView, onSelect: () => handlers.onView?.() },
    { id: "reschedule", label: isBlock ? "Editar bloqueio" : "Reagendar", icon: PencilLine, hidden: !canEdit || !handlers.onReschedule, onSelect: () => handlers.onReschedule?.() },
    { id: "patient", label: "Abrir ficha do paciente", icon: User, hidden: isBlock || !appointment.patientId || !handlers.onOpenPatient, onSelect: () => handlers.onOpenPatient?.() },
    {
      id: "status",
      label: "Alterar situação",
      icon: CircleCheck,
      kind: "submenu",
      group: "status",
      hidden: isBlock || forward.length === 0,
      items: forward.map((to) => ({
        id: `status-${to}`,
        label: TRANSITION_ACTION_LABELS[to] ?? STATUS_LABELS[to],
        onSelect: () => handlers.onChangeStatus(to),
      })),
    },
    { id: "copy-time", label: "Copiar horário", icon: CalendarClock, kind: "copy", text: appointmentTimeText(appointment), successMessage: "Horário copiado.", group: "clipboard" },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: appointment.id, group: "clipboard" },
    {
      id: "cancel",
      label: isBlock ? "Remover bloqueio" : "Cancelar atendimento",
      hidden: !canCancel,
      destructive: true,
      confirm: {
        title: isBlock ? "Remover bloqueio?" : "Cancelar atendimento?",
        description: "O horário volta a ficar livre na agenda. A ação fica registrada na auditoria.",
        confirmLabel: "Confirmar cancelamento",
        reason: { label: "Motivo", required: handlers.requireCancelReason },
      },
      onSelect: (reason) => handlers.onChangeStatus("cancelled", reason),
    },
  ]
}
