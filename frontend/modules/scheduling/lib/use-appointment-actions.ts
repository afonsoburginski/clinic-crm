"use client"

import { useRouter } from "next/navigation"
import { useCallback } from "react"

import type { Appointment } from "@/domain/types"
import { useCurrentUser } from "@/shared/lib/current-user"
import type { EntityAction } from "@/shared/ui/entity-menu"

import { useChangeStatus, useSettings } from "../queries"
import { appointmentActions } from "./appointment-actions"

/**
 * Fábrica das ações de um agendamento para qualquer tela (grade, mês, painel, ficha do paciente): junta a sessão,
 * a regra de motivo de cancelamento da clínica e as mutations. Sem `onView`/`onReschedule` esses itens não aparecem.
 */
export function useAppointmentActionsFor({
  onView,
  onReschedule,
}: { onView?: (appointment: Appointment) => void; onReschedule?: (appointment: Appointment) => void } = {}) {
  const router = useRouter()
  const { user } = useCurrentUser()
  const settings = useSettings()
  const changeStatus = useChangeStatus()
  const requireCancelReason = settings.data?.requireCancelReason ?? true

  return useCallback(
    (appointment: Appointment): EntityAction[] =>
      appointmentActions(appointment, {
        user,
        requireCancelReason,
        onView: onView && (() => onView(appointment)),
        onReschedule: onReschedule && (() => onReschedule(appointment)),
        onOpenPatient: () => appointment.patientId && router.push(`/pacientes/${appointment.patientId}`),
        // Otimista: a agenda já mostra o novo status; se o servidor recusar, o cache volta e o toast explica o motivo.
        onChangeStatus: (to, reason) => changeStatus.mutate({ id: appointment.id, to, reason }),
      }),
    [user, requireCancelReason, onView, onReschedule, router, changeStatus]
  )
}
