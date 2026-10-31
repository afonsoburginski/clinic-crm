"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import type { GuardianInput, GuardianLinkInput, PatientInput } from "@/domain/schemas"
import type { Patient, PatientStatus } from "@/domain/types"
import { api, type PatientFilters, type PatientGuardian } from "@/shared/api/api"
import { optimisticPatch } from "@/shared/lib/optimistic"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

import { patientToInput } from "./lib/patient-input"

export const PATIENT_STATUS_LABELS: Record<PatientStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  archived: "Arquivado",
}

export const patientKeys = {
  all: ["patients"] as const,
  list: (filters: PatientFilters) => ["patients", "list", filters] as const,
  detail: (id: string) => ["patients", "detail", id] as const,
  guardians: (id: string) => ["patients", "guardians", id] as const,
  appointments: (id: string) => ["patients", "appointments", id] as const,
}

export function usePatients(filters: PatientFilters) {
  return useQuery({
    queryKey: patientKeys.list(filters),
    queryFn: () => api.patients.list(filters),
    placeholderData: keepPreviousData,
  })
}

export function usePatient(id: string) {
  return useQuery({ queryKey: patientKeys.detail(id), queryFn: () => api.patients.get(id), retry: false })
}

export function usePatientGuardians(id: string) {
  return useQuery({ queryKey: patientKeys.guardians(id), queryFn: () => api.guardians.forPatient(id) })
}

export function usePatientAppointments(id: string) {
  return useQuery({ queryKey: patientKeys.appointments(id), queryFn: () => api.appointments.forPatient(id) })
}

export function usePossibleDuplicates(input: { fullName: string; birthDate?: string; document?: string; id?: string }) {
  return useQuery({
    queryKey: ["patients", "duplicates", input],
    queryFn: () => api.patients.checkDuplicates(input),
    enabled: input.fullName.trim().length >= 5 || (input.document?.replace(/\D/g, "").length ?? 0) === 11,
    staleTime: 10_000,
  })
}

export function useGuardians(search: string) {
  return useQuery({
    queryKey: ["guardians", search],
    queryFn: () => api.guardians.list(search),
    placeholderData: keepPreviousData,
  })
}

export function useSavePatient(id?: string) {
  return useApiMutation<PatientInput, Patient>(
    (input) => (id ? api.patients.update(id, input) : api.patients.create(input)),
    { invalidate: [patientKeys.all], success: id ? "Cadastro atualizado." : "Paciente cadastrado." }
  )
}

export function useSaveGuardian(id?: string) {
  return useApiMutation(
    (input: GuardianInput) => (id ? api.guardians.update(id, input) : api.guardians.create(input)),
    { invalidate: [["guardians"], patientKeys.all], success: id ? "Responsável atualizado." : undefined }
  )
}

export function useLinkGuardian(patientId: string) {
  return useApiMutation(
    ({ input, linkId }: { input: GuardianLinkInput; linkId?: string }) => api.guardians.link(patientId, input, linkId),
    {
      invalidate: [patientKeys.guardians(patientId), ["guardians"]],
      success: (_, vars) => (vars.linkId ? "Vínculo atualizado." : "Responsável vinculado."),
    }
  )
}

/** O vínculo some da ficha na hora; se o servidor recusar, a lista volta ao snapshot. */
export function useUnlinkGuardian(patientId: string) {
  return useApiMutation((linkId: string) => api.guardians.unlink(linkId), {
    invalidate: [patientKeys.guardians(patientId), ["guardians"]],
    success: "Vínculo removido.",
    optimistic: [
      optimisticPatch<PatientGuardian[], string>(patientKeys.guardians(patientId), (list, linkId) =>
        list.filter((entry) => entry.link.id !== linkId)
      ),
    ],
  })
}

/** Inativar/reativar a partir da lista: o id vem na chamada (o hook de `useSavePatient` é por paciente). */
export function useSetPatientStatus() {
  return useApiMutation(
    ({ patient, status }: { patient: Patient; status: PatientStatus }) => api.patients.update(patient.id, { ...patientToInput(patient), status }),
    { invalidate: [patientKeys.all], success: (_, vars) => (vars.status === "active" ? "Paciente reativado." : "Paciente inativado.") }
  )
}
