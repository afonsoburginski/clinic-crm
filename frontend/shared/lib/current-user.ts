"use client"

import { useQuery } from "@tanstack/react-query"

import { can, type Permission } from "@/domain/permissions"
import { api } from "@/shared/api/demo-api"
import { useSessionStore } from "@/shared/lib/session-store"
import { useHydrated } from "@/shared/lib/use-hydrated"

export function useCurrentUser() {
  const hydrated = useHydrated()
  const userId = useSessionStore((s) => s.userId)
  const query = useQuery({
    queryKey: ["auth", "me", userId],
    queryFn: () => api.auth.me(),
    enabled: hydrated && !!userId,
    staleTime: Infinity,
  })
  return {
    user: query.data ?? null,
    isLoading: !hydrated || (!!userId && query.isLoading),
    isSignedIn: hydrated && !!userId,
  }
}

export function useCan(permission: Permission) {
  const { user } = useCurrentUser()
  return can(user, permission)
}
