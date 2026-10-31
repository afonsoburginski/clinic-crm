"use client"

import { useQuery } from "@tanstack/react-query"

import type { ClinicalRecordInput, RectificationInput } from "@/domain/schemas"
import type { ClinicalRecord, ClinicalRecordKind } from "@/domain/types"
import { api } from "@/shared/api/api"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

export const chartKeys = {
  all: ["clinical-records"] as const,
  patients: ["clinical-records", "patients"] as const,
  list: (patientId: string, kind: ClinicalRecordKind | "all") => ["clinical-records", "list", patientId, kind] as const,
  detail: (id: string) => ["clinical-records", "detail", id] as const,
  versions: (rootId: string) => ["clinical-records", "versions", rootId] as const,
}

export function useChartPatients() {
  return useQuery({ queryKey: chartKeys.patients, queryFn: () => api.clinicalRecords.patients(), retry: false })
}

/** Cadastro do paciente; mesma chave do módulo de pacientes para compartilhar cache. */
export function useChartPatient(patientId: string) {
  return useQuery({ queryKey: ["patients", "detail", patientId], queryFn: () => api.patients.get(patientId), retry: false })
}

export function usePatientAppointmentsForRecords(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["patients", "appointments", patientId],
    queryFn: () => api.appointments.forPatient(patientId),
    enabled,
  })
}

export function useRecords(patientId: string, kind: ClinicalRecordKind | "all") {
  return useQuery({
    queryKey: chartKeys.list(patientId, kind),
    queryFn: () => api.clinicalRecords.list(patientId, { kind }),
    retry: false,
  })
}

export function useRecord(id: string) {
  return useQuery({ queryKey: chartKeys.detail(id), queryFn: () => api.clinicalRecords.get(id), retry: false })
}

export function useRecordVersions(rootId: string) {
  return useQuery({
    queryKey: chartKeys.versions(rootId),
    queryFn: () => api.clinicalRecords.versions(rootId),
    enabled: !!rootId,
    retry: false,
  })
}

export function useSaveRecord(patientId: string, id?: string) {
  return useApiMutation<ClinicalRecordInput, ClinicalRecord>(
    (input) => (id ? api.clinicalRecords.update(id, input) : api.clinicalRecords.create(patientId, input)),
    { invalidate: [chartKeys.all], success: id ? "Rascunho salvo." : "Rascunho criado." }
  )
}

/** Finalizar uma retificação pode revogar liberações de documentos, então invalida `documents`. */
export function useFinalizeRecord() {
  return useApiMutation((id: string) => api.clinicalRecords.finalize(id), {
    invalidate: [chartKeys.all, ["documents"]],
    success: "Registro finalizado.",
  })
}

export function useRectifyRecord() {
  return useApiMutation<{ id: string; input: RectificationInput }, ClinicalRecord>(
    ({ id, input }) => api.clinicalRecords.rectify(id, input),
    { invalidate: [chartKeys.all], success: "Retificação iniciada em rascunho." }
  )
}
