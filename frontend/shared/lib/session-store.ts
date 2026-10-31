import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { User } from "@/domain/types"

export interface Session {
  user: User
  accessToken: string
  expiresAt: string
}

interface SessionState {
  userId: string | null
  /** Snapshot do usuário da sessão: permite resolver permissões de forma síncrona na UI (o servidor é quem decide). */
  user: User | null
  accessToken: string | null
  expiresAt: string | null
  signIn: (session: Session) => void
  setUser: (user: User) => void
  signOut: () => void
}

const SIGNED_OUT = { userId: null, user: null, accessToken: null, expiresAt: null }

export function isSessionExpired(expiresAt: string | null) {
  return !expiresAt || Date.parse(expiresAt) <= Date.now()
}

/** Sessão utilizável: tem token e ele ainda não venceu. */
export function hasActiveSession(state: Pick<SessionState, "accessToken" | "expiresAt">) {
  return !!state.accessToken && !isSessionExpired(state.expiresAt)
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...SIGNED_OUT,
      signIn: ({ user, accessToken, expiresAt }) => set({ userId: user.id, user, accessToken, expiresAt }),
      setUser: (user) => set({ userId: user.id, user }),
      signOut: () => set(SIGNED_OUT),
    }),
    {
      name: "villiere-session",
      // Versões anteriores guardavam outra forma de sessão: sem token válido da API volta deslogado.
      version: 3,
      migrate: () => SIGNED_OUT,
    }
  )
)
