import type { Patient } from "@/domain/types"
import { useSessionStore } from "@/shared/lib/session-store"

import { toPatient } from "./backend-mappers"
import { items } from "./helpers"

const PATIENT_LIST_TTL_MS = 5_000
let patientListCache: { token: string | null; at: number; promise: Promise<Patient[]> } | null = null

/**
 * A API só filtra por nome/CPF cru e o CPF é guardado com máscara, então busca, status e
 * duplicidade rodam no cliente sobre a lista completa. Cache curto evita um GET por tecla digitada
 * e serve de diretório para juntar nomes de pacientes em documentos, lançamentos e avaliações.
 */
export function loadPatients(): Promise<Patient[]> {
  const token = useSessionStore.getState().accessToken
  if (patientListCache && patientListCache.token === token && Date.now() - patientListCache.at < PATIENT_LIST_TTL_MS) {
    return patientListCache.promise
  }
  const promise = items("/patients").then((rows) => rows.map(toPatient))
  const entry = { token, at: Date.now(), promise }
  patientListCache = entry
  promise.catch(() => {
    if (patientListCache === entry) patientListCache = null
  })
  return promise
}

export const invalidatePatients = () => {
  patientListCache = null
}
