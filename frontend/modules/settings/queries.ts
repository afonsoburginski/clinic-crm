"use client"

import { useQuery } from "@tanstack/react-query"

import type { SettingsInput } from "@/domain/schemas"
import { api } from "@/shared/api/api"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

export function useClinicSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.settings.get() })
}

export function useUpdateSettings() {
  return useApiMutation((input: SettingsInput) => api.settings.update(input), {
    invalidate: [["settings"]],
    success: "Configurações salvas",
    silentError: true,
  })
}

export function useAuditLog(filters: { resource: string; actorId: string }) {
  return useQuery({ queryKey: ["audit", filters], queryFn: () => api.audit.list(filters) })
}
