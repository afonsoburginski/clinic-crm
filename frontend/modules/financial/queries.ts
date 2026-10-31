"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import type { FinancialEntryInput, PaymentInput, ReasonInput } from "@/domain/schemas"
import type { FinancialEntry } from "@/domain/types"
import { api, type FinancialQueryFilters, type FinancialSearchParams } from "@/shared/api/api"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

import { createFinancialXlsx, downloadBlob } from "./lib/export-xlsx"

/** Tudo sob `["financial"]`: uma mutação financeira invalida relatório, busca e detalhe de uma vez. */
export const financialKeys = {
  all: ["financial"] as const,
  detail: (id: string) => ["financial", "detail", id] as const,
  report: (filters: FinancialQueryFilters) => ["financial", "report", filters] as const,
  search: (filters: FinancialQueryFilters, params: FinancialSearchParams) => ["financial", "search", filters, params] as const,
}

/** Indicadores e gráficos do filtro atual. */
export function useFinancialReport(filters: FinancialQueryFilters) {
  return useQuery({
    queryKey: financialKeys.report(filters),
    queryFn: () => api.financial.report(filters),
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/** Uma página da tabela, paginada e ordenada no servidor com o mesmo filtro. */
export function useFinancialSearch(filters: FinancialQueryFilters, params: FinancialSearchParams) {
  return useQuery({
    queryKey: financialKeys.search(filters, params),
    queryFn: () => api.financial.search(filters, params),
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/**
 * RF-FIN-008: exporta o filtro atual (todas as páginas) para XLSX. O relatório é buscado de novo para a aba
 * Resumo bater com as linhas; o `exceljs` só é carregado aqui, no clique. Auditoria e painel são invalidados.
 */
export function useExportFinancial() {
  return useApiMutation<FinancialQueryFilters, { fileName: string; total: number }>(
    async (filters) => {
      const [exported, report] = await Promise.all([api.financial.export(filters), api.financial.report(filters)])
      const { blob, fileName } = await createFinancialXlsx({
        rows: exported.rows,
        patientNames: exported.patientNames,
        filters,
        report,
        generatedAt: new Date(),
      })
      downloadBlob(blob, fileName)
      return { fileName, total: exported.total }
    },
    {
      invalidate: [],
      success: ({ total }) => (total === 1 ? "Planilha exportada com 1 lançamento." : `Planilha exportada com ${total} lançamentos.`),
    }
  )
}

export function useFinancialEntry(id: string) {
  return useQuery({ queryKey: financialKeys.detail(id), queryFn: () => api.financial.get(id), retry: false })
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

/** Cancelar a partir da lista: o id vem na chamada (`useCancelEntry` é por lançamento). */
export function useCancelEntryRow() {
  return useApiMutation(({ id, input }: { id: string; input: ReasonInput }) => api.financial.cancel(id, input), {
    invalidate: [financialKeys.all],
    success: "Lançamento cancelado.",
  })
}
