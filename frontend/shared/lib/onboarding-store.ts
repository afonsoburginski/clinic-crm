import { create } from "zustand"
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware"

/** Sobe quando o roteiro muda de forma relevante: quem só viu a versão anterior vê a nova uma vez. */
export const TOUR_VERSION = 1

export type TourOutcome = "completed" | "dismissed"

export interface TourRecord {
  outcome: TourOutcome
  version: number
  at: string
}

interface OnboardingState {
  /** Desfecho da orientação por usuário (`userId`). */
  records: Record<string, TourRecord>
  finish: (userId: string, outcome: TourOutcome) => void
  reset: (userId: string) => void
}

const memoryStorage = (): StateStorage => {
  const data = new Map<string, string>()
  return {
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => void data.set(name, value),
    removeItem: (name) => void data.delete(name),
  }
}

// Servidor/SSR (ou localStorage bloqueado) cai num storage em memória: nada quebra, só não persiste.
function browserStorage(): StateStorage {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage
  } catch {
    // Acesso negado ao localStorage (modo restrito): segue em memória.
  }
  return memoryStorage()
}

export function createOnboardingStore(storage: StateStorage = browserStorage()) {
  return create<OnboardingState>()(
    persist(
      (set) => ({
        records: {},
        finish: (userId, outcome) =>
          set((state) => {
            const current = state.records[userId]
            // Dispensar uma revisão não apaga que o roteiro atual já foi concluído.
            if (current?.version === TOUR_VERSION && current.outcome === "completed") return state
            return { records: { ...state.records, [userId]: { outcome, version: TOUR_VERSION, at: new Date().toISOString() } } }
          }),
        reset: (userId) =>
          set((state) => {
            const { [userId]: _removed, ...records } = state.records
            return { records }
          }),
      }),
      { name: "villiere-onboarding", version: 2, migrate: () => ({ records: {} }), storage: createJSONStorage(() => storage), partialize: (state) => ({ records: state.records }) }
    )
  )
}

export const useOnboardingStore = createOnboardingStore()

/** A orientação abre sozinha só na primeira visita autenticada (ou quando o roteiro ganhou versão nova). */
export function shouldAutoOpenTour(record: TourRecord | undefined) {
  return !record || record.version < TOUR_VERSION
}
