"use client"

import { useQuery } from "@tanstack/react-query"

import type { AssessmentInput, InterpretationInput, ReasonInput } from "@/domain/schemas"
import type { Assessment, AssessmentStageStatus, AssessmentStatus } from "@/domain/types"
import { api } from "@/shared/api/demo-api"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

export const assessmentKeys = {
  all: ["assessments"] as const,
  list: (status: AssessmentStatus | "all") => ["assessments", "list", status] as const,
  detail: (id: string) => ["assessments", "detail", id] as const,
}

export function useAssessments(status: AssessmentStatus | "all") {
  return useQuery({ queryKey: assessmentKeys.list(status), queryFn: () => api.assessments.list({ status }), retry: false })
}

export function useAssessment(id: string) {
  return useQuery({ queryKey: assessmentKeys.detail(id), queryFn: () => api.assessments.get(id), retry: false })
}

export function useCreateAssessment() {
  return useApiMutation<AssessmentInput, Assessment>((input) => api.assessments.create(input), {
    invalidate: [assessmentKeys.all],
    success: "Avaliação aberta.",
  })
}

export function useSetStage(id: string) {
  return useApiMutation(({ stageId, to }: { stageId: string; to: AssessmentStageStatus }) => api.assessments.setStage(id, stageId, to), {
    invalidate: [assessmentKeys.all],
    success: "Etapa atualizada.",
  })
}

export function useSaveInterpretation(id: string) {
  return useApiMutation((input: InterpretationInput) => api.assessments.saveInterpretation(id, input), {
    invalidate: [assessmentKeys.all],
    success: "Interpretação registrada.",
  })
}

export function useCompleteAssessment(id: string) {
  return useApiMutation(() => api.assessments.complete(id), { invalidate: [assessmentKeys.all], success: "Avaliação concluída." })
}

export function useCancelAssessment(id: string) {
  return useApiMutation((input: ReasonInput) => api.assessments.cancel(id, input), {
    invalidate: [assessmentKeys.all],
    success: "Avaliação cancelada.",
  })
}
