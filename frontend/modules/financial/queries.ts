"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import type { FinancialEntryInput, PaymentInput, ReasonInput } from "@/domain/schemas"
import type { FinancialEntry } from "@/domain/types"
import { api, type FinancialFilters } from "@/shared/api/demo-api"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

export const financialKeys = {
  all: ["financial"] as const,
  list: (filters: FinancialFilters) => ["financial", "list", filters] as const,
  detail: (id: string) => ["financial", "detail", id] as const,
  summary: (competence: string) => ["financial", "summary", competence] as const,
}

export function useFinancialEntries(filters: FinancialFilters) {
  return useQuery({
    queryKey: financialKeys.list(filters),
    queryFn: () => api.financial.list(filters),
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useFinancialEntry(id: string) {
  return useQuery({ queryKey: financialKeys.detail(id), queryFn: () => api.financial.get(id), retry: false })
}

export function useFinancialSummary(competence: string) {
  return useQuery({
    queryKey: financialKeys.summary(competence),
    queryFn: () => api.financial.summary(competence),
    placeholderData: keepPreviousData,
    enabled: /^\d{4}-\d{2}$/.test(competence),
    retry: false,
  })
}

export function useSaveEntry(id?: string) {
  return useApiMutation<FinancialEntryInput, FinancialEntry>(
    (input) => (id ? api.financial.update(id, input) : api.financial.create(input)),
    { invalidate: [financialKeys.all], success: id ? "Lançamento atualizado." : "Lançamento criado." }
  )
}

export function useRegisterPayment(entryId: string) {
  return useApiMutation((input: PaymentInput) => api.financial.registerPayment(entryId, input), {
    invalidate: [financialKeys.all],
    success: "Pagamento registrado.",
  })
}

export function useReversePayment() {
  return useApiMutation(({ paymentId, input }: { paymentId: string; input: ReasonInput }) => api.financial.reversePayment(paymentId, input), {
    invalidate: [financialKeys.all],
    success: "Pagamento estornado.",
  })
}

export function useCancelEntry(id: string) {
  return useApiMutation((input: ReasonInput) => api.financial.cancel(id, input), {
    invalidate: [financialKeys.all],
    success: "Lançamento cancelado.",
  })
}
