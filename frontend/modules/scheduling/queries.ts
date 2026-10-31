"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import type { AppointmentInput } from "@/domain/schemas"
import type { Appointment, AppointmentStatus } from "@/domain/types"
import { api, type AppointmentFilters } from "@/shared/api/demo-api"
import { optimisticPatch, patchById } from "@/shared/lib/optimistic"
import { useSessionStore } from "@/shared/lib/session-store"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

export function useAppointments(filters: AppointmentFilters) {
  const userId = useSessionStore((s) => s.userId)
  return useQuery({
    queryKey: ["appointments", userId, filters],
    queryFn: () => api.appointments.list(filters),
    placeholderData: keepPreviousData,
  })
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.settings.get(), staleTime: 60_000 })
}

/** Conflitos são exibidos no formulário, então o erro não vira toast. */
export function useSaveAppointment(id?: string) {
  return useApiMutation<AppointmentInput, Appointment | Appointment[]>(
    (input) => (id ? api.appointments.reschedule(id, input) : api.appointments.create(input)),
    {
      invalidate: [["appointments"]],
      silentError: true,
      success: (result) =>
        Array.isArray(result) && result.length > 1
          ? `${result.length} ocorrências agendadas.`
          : id
            ? "Agendamento atualizado."
            : "Agendamento criado.",
    }
  )
}

interface ChangeStatusVars {
  id: string
  to: AppointmentStatus
  reason?: string
}

/** Efeito esperado da transição, igual ao que o servidor grava (status, motivo e carimbo do cancelamento). */
function withStatus(appointment: Appointment, { to, reason }: ChangeStatusVars): Appointment {
  const next: Appointment = { ...appointment, status: to }
  if (to === "cancelled") {
    next.cancelReason = reason?.trim()
    next.cancelledAt = new Date().toISOString()
  }
  return next
}

/**
 * Agenda e histórico do paciente mudam de status na hora (otimista); regras de transição,
 * permissão e motivo continuam sendo do servidor: se ele recusar, o cache volta ao snapshot.
 */
export function useChangeStatus() {
  return useApiMutation(
    ({ id, to, reason }: ChangeStatusVars) => api.appointments.changeStatus(id, to, reason),
    {
      invalidate: [["appointments"], ["patients", "appointments"]],
      success: "Status atualizado.",
      optimistic: [
        optimisticPatch<Appointment[], ChangeStatusVars>(["appointments"], (list, vars) =>
          patchById(list, vars.id, (appointment) => withStatus(appointment, vars))
        ),
        optimisticPatch<Appointment[], ChangeStatusVars>(["patients", "appointments"], (list, vars) =>
          patchById(list, vars.id, (appointment) => withStatus(appointment, vars))
        ),
      ],
    }
  )
}
