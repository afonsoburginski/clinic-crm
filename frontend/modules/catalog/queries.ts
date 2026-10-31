"use client"

import { useQuery } from "@tanstack/react-query"

import type { ProfessionalInput, RoomInput, ServiceInput, SpecialtyInput, UnavailabilityInput } from "@/domain/schemas"
import type { Professional, WeeklySlot } from "@/domain/types"
import { api } from "@/shared/api/api"
import { optimisticPatch, patchById } from "@/shared/lib/optimistic"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

export function useProfessional(id: string) {
  return useQuery({ queryKey: ["professionals", id], queryFn: () => api.professionals.get(id), retry: false })
}

export function useSaveProfessional(id?: string) {
  return useApiMutation<ProfessionalInput, Professional>(
    (input) => api.professionals.save(input, id) as Promise<Professional>,
    { invalidate: [["professionals"]], success: id ? "Profissional atualizado." : "Profissional cadastrado." }
  )
}

export function useSaveSchedule(id: string) {
  return useApiMutation((schedule: WeeklySlot[]) => api.professionals.setSchedule(id, schedule), {
    invalidate: [["professionals"]],
    success: "Grade de horários salva.",
  })
}

export function useAddUnavailability(id: string) {
  return useApiMutation((input: UnavailabilityInput) => api.professionals.addUnavailability(id, input), {
    invalidate: [["professionals"]],
    success: "Indisponibilidade registrada.",
  })
}

/** Remove do detalhe e da lista de profissionais (chaves distintas, por isso `exact`). */
export function useRemoveUnavailability(id: string) {
  const withoutItem = (professional: Professional, unavailabilityId: string): Professional => ({
    ...professional,
    unavailabilities: professional.unavailabilities.filter((u) => u.id !== unavailabilityId),
  })
  return useApiMutation((unavailabilityId: string) => api.professionals.removeUnavailability(id, unavailabilityId), {
    invalidate: [["professionals"]],
    success: "Indisponibilidade removida.",
    optimistic: [
      optimisticPatch<Professional, string>(["professionals", id], withoutItem, { exact: true }),
      optimisticPatch<Professional[], string>(["professionals"], (list, unavailabilityId) => patchById(list, id, (p) => withoutItem(p, unavailabilityId)), {
        exact: true,
      }),
    ],
  })
}

export function useSaveSpecialty() {
  return useApiMutation(({ input, id }: { input: SpecialtyInput; id?: string }) => api.specialties.save(input, id), {
    invalidate: [["specialties"]],
    success: (_, vars) => (vars.id ? "Especialidade atualizada." : "Especialidade criada."),
  })
}

export function useSaveService() {
  return useApiMutation(({ input, id }: { input: ServiceInput; id?: string }) => api.services.save(input, id), {
    invalidate: [["services"]],
    success: (_, vars) => (vars.id ? "Serviço atualizado." : "Serviço criado."),
  })
}

export function useSaveRoom() {
  return useApiMutation(({ input, id }: { input: RoomInput; id?: string }) => api.rooms.save(input, id), {
    invalidate: [["rooms"]],
    success: (_, vars) => (vars.id ? "Sala atualizada." : "Sala criada."),
  })
}
