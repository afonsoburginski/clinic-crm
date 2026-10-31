import type { PatientInput } from "@/domain/schemas"
import type { Patient } from "@/domain/types"

/** Valores do formulário de paciente a partir do cadastro (vazio quando não há paciente). */
export function patientToInput(patient?: Patient): PatientInput {
  return {
    fullName: patient?.fullName ?? "",
    socialName: patient?.socialName ?? "",
    birthDate: patient?.birthDate ?? "",
    document: patient?.document ?? "",
    phone: patient?.phone ?? "",
    email: patient?.email ?? "",
    address: patient?.address ?? "",
    status: patient?.status ?? "active",
    mainProfessionalId: patient?.mainProfessionalId ?? "",
    consentData: patient?.consentData ?? false,
    consentImage: patient?.consentImage ?? false,
    administrativeNotes: patient?.administrativeNotes ?? "",
  }
}
