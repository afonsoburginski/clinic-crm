"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import type { DocumentInput, ReasonInput, ReleaseInput } from "@/domain/schemas"
import type { DocumentClassification, DocumentStatus, PatientDocument } from "@/domain/types"
import { api } from "@/shared/api/api"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

export interface DocumentFilters {
  classification: DocumentClassification | "all"
  status: DocumentStatus | "all"
}

export const documentKeys = {
  all: ["documents"] as const,
  list: (filters: DocumentFilters) => ["documents", "list", filters] as const,
  detail: (id: string) => ["documents", "detail", id] as const,
}

export function useDocuments(filters: DocumentFilters) {
  return useQuery({
    queryKey: documentKeys.list(filters),
    queryFn: () => api.documents.list(filters),
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useDocument(id: string) {
  return useQuery({ queryKey: documentKeys.detail(id), queryFn: () => api.documents.get(id), retry: false })
}

/** Mesma chave do módulo de pacientes para compartilhar cache. */
export function useDocumentGuardians(patientId: string) {
  return useQuery({ queryKey: ["patients", "guardians", patientId], queryFn: () => api.guardians.forPatient(patientId) })
}

/** Documentos clínicos do prontuário (chave compatível com `clinical-records`). */
export function useClinicalDocumentRecords(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["clinical-records", "list", patientId, "document"],
    queryFn: () => api.clinicalRecords.list(patientId, { kind: "document" }),
    enabled: enabled && !!patientId,
    retry: false,
  })
}

export function useSaveDocument(id?: string) {
  return useApiMutation<DocumentInput, PatientDocument>(
    (input) => (id ? api.documents.update(id, input) : api.documents.create(input)),
    { invalidate: [documentKeys.all], success: id ? "Documento atualizado." : "Documento criado em rascunho." }
  )
}

export function useSetDocumentStatus(id: string) {
  return useApiMutation((to: DocumentStatus) => api.documents.setStatus(id, to), {
    invalidate: [documentKeys.all],
    success: (_, to) => (to === "issued" ? "Documento emitido." : "Documento arquivado."),
  })
}

export function useReleaseDocument(id: string) {
  return useApiMutation((input: ReleaseInput) => api.documents.release(id, input), {
    invalidate: [documentKeys.all],
    success: "Documento liberado ao responsável.",
  })
}

export function useRevokeRelease(id: string) {
  return useApiMutation(({ releaseId, input }: { releaseId: string; input: ReasonInput }) => api.documents.revokeRelease(id, releaseId, input), {
    invalidate: [documentKeys.all],
    success: "Liberação revogada.",
  })
}
