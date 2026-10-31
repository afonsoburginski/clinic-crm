"use client"

import { useQuery } from "@tanstack/react-query"

import type { AbaGoalInput, AbaGoalStatusInput, AbaPlanInput, AbaSessionInput, ReasonInput } from "@/domain/schemas"
import type { AbaPlan, AbaPlanStatus } from "@/domain/types"
import { api } from "@/shared/api/api"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

export const abaKeys = {
  all: ["aba"] as const,
  list: (status: AbaPlanStatus | "all") => ["aba", "list", status] as const,
  detail: (id: string) => ["aba", "detail", id] as const,
}

export function useAbaPlans(status: AbaPlanStatus | "all") {
  return useQuery({ queryKey: abaKeys.list(status), queryFn: () => api.aba.listPlans({ status }), retry: false })
}

/** Plano com sessões e progresso calculado só das medidas registradas. */
export function useAbaPlan(id: string) {
  return useQuery({ queryKey: abaKeys.detail(id), queryFn: () => api.aba.getPlan(id), retry: false })
}

export function useCreatePlan() {
  return useApiMutation<AbaPlanInput, AbaPlan>((input) => api.aba.createPlan(input), {
    invalidate: [abaKeys.all],
    success: "Plano criado em rascunho.",
  })
}

export function useUpdatePlan(id: string) {
  return useApiMutation((input: AbaPlanInput) => api.aba.updatePlan(id, input), { invalidate: [abaKeys.all], success: "Plano atualizado." })
}

export function useSaveGoal(planId: string) {
  return useApiMutation(({ input, goalId }: { input: AbaGoalInput; goalId?: string }) => api.aba.saveGoal(planId, input, goalId), {
    invalidate: [abaKeys.all],
    success: (_, vars) => (vars.goalId ? "Objetivo atualizado." : "Objetivo adicionado."),
  })
}

export function useSetGoalStatus(planId: string) {
  return useApiMutation(
    ({ goalId, input }: { goalId: string; input: AbaGoalStatusInput }) => api.aba.setGoalStatus(planId, goalId, input),
    { invalidate: [abaKeys.all], success: "Situação do objetivo atualizada." }
  )
}

export function useActivatePlan(id: string) {
  return useApiMutation(() => api.aba.activatePlan(id), { invalidate: [abaKeys.all], success: "Plano ativado." })
}

export function useClosePlan(id: string) {
  return useApiMutation((input: ReasonInput) => api.aba.closePlan(id, input), { invalidate: [abaKeys.all], success: "Plano encerrado." })
}

export function useRecordSession() {
  return useApiMutation((input: AbaSessionInput) => api.aba.recordSession(input), { invalidate: [abaKeys.all], success: "Sessão registrada." })
}

export function useVoidSession() {
  return useApiMutation(({ sessionId, input }: { sessionId: string; input: ReasonInput }) => api.aba.voidSession(sessionId, input), {
    invalidate: [abaKeys.all],
    success: "Sessão anulada.",
  })
}
