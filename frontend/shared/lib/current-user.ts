"use client"

import { useQuery } from "@tanstack/react-query"

import { can, type Permission } from "@/domain/permissions"
import { api } from "@/shared/api/demo-api"
import { hasActiveSession, useSessionStore } from "@/shared/lib/session-store"
import { useHydrated } from "@/shared/lib/use-hydrated"

export function useCurrentUser() {
  const hydrated = useHydrated()
  const userId = useSessionStore((s) => s.userId)
  const snapshot = useSessionStore((s) => s.user)
  const signedIn = useSessionStore(hasActiveSession)
  // Valida o token guardado (GET /auth/session); token recusado encerra a sessão e o painel volta ao login.
  const query = useQuery({
    queryKey: ["auth", "me", userId],
    queryFn: () => api.auth.me(),
    enabled: hydrated && signedIn,
    staleTime: Infinity,
  })
  // O snapshot persistido evita piscar o esqueleto no reload e mantém o painel de pé se a API estiver fora.
  const user = signedIn ? (query.data ?? snapshot) : null
  return {
    user,
    isLoading: !hydrated || (signedIn && !user && query.isLoading),
    isSignedIn: hydrated && signedIn,
  }
}

export function useCan(permission: Permission) {
  const { user } = useCurrentUser()
  return can(user, permission)
}
