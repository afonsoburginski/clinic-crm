import { can } from "./permissions"
import type { Appointment, AppointmentStatus, User } from "./types"

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  requested: "Solicitado",
  pending: "Pendente",
  confirmed: "Confirmado",
  in_progress: "Em atendimento",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
}

export const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  requested: ["pending", "confirmed", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "no_show", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
}

export const TRANSITION_ACTION_LABELS: Partial<Record<AppointmentStatus, string>> = {
  pending: "Marcar pendente",
  confirmed: "Confirmar",
  in_progress: "Iniciar atendimento",
  completed: "Concluir",
  no_show: "Registrar falta",
  cancelled: "Cancelar",
}

export const INACTIVE_STATUSES: AppointmentStatus[] = ["cancelled", "no_show"]

export function isTerminal(status: AppointmentStatus) {
  return TRANSITIONS[status].length === 0
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus) {
  return TRANSITIONS[from].includes(to)
}

const PROFESSIONAL_OWN_TRANSITIONS: AppointmentStatus[] = ["in_progress", "completed", "no_show"]

export function canUserTransition(
  user: User | null | undefined,
  appt: Pick<Appointment, "status" | "professionalId">,
  to: AppointmentStatus
) {
  if (!user || !canTransition(appt.status, to)) return false
  if (to === "cancelled") return can(user, "appointments:cancel")
  if (can(user, "appointments:write")) return true
  return (
    can(user, "appointments:status-own") &&
    appt.professionalId === user.professionalId &&
    PROFESSIONAL_OWN_TRANSITIONS.includes(to)
  )
}

export function availableTransitions(
  user: User | null | undefined,
  appt: Pick<Appointment, "status" | "professionalId">
) {
  return TRANSITIONS[appt.status].filter((to) => canUserTransition(user, appt, to))
}
