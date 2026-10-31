"use client"

import { useQuery } from "@tanstack/react-query"

import { api } from "@/shared/api/api"
import { useSessionStore } from "@/shared/lib/session-store"

export function useDashboardSummary() {
  const userId = useSessionStore((s) => s.userId)
  return useQuery({ queryKey: ["dashboard", userId], queryFn: () => api.dashboard.summary() })
}
