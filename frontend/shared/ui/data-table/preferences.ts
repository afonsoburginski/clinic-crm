"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/shared/api/api"
import type { TableViewInput } from "@/shared/api/table-preferences-api"
import type { TableView } from "@/shared/api/table-preferences-mappers"
import { notifyError, notifySuccess } from "@/shared/lib/notify"
import { useSessionStore } from "@/shared/lib/session-store"

/** O usuário entra na chave: as visões de quem saiu nunca aparecem para quem entra na mesma aba. */
export const tablePreferenceKeys = {
  all: ["table-preferences"] as const,
  table: (userId: string | null, tableKey: string) => ["table-preferences", userId, tableKey] as const,
}

/** Visões do usuário da sessão para uma tabela. Falha de rede não quebra a tabela: ela segue com o estado local. */
export function useTablePreferences(tableKey: string | undefined) {
  const userId = useSessionStore((s) => s.userId)
  return useQuery({
    queryKey: tablePreferenceKeys.table(userId, tableKey ?? "-"),
    queryFn: () => api.tablePreferences.list(tableKey!),
    enabled: !!tableKey,
    staleTime: 60_000,
    retry: false,
  })
}

interface SaveVars {
  name: string
  input: TableViewInput
  /** Gravação automática das preferências de trabalho: sem aviso na tela. */
  silent?: boolean
}

/** Grava (cria ou substitui) uma visão e já a coloca no cache, sem refazer a consulta. */
export function useSaveTableView(tableKey: string | undefined) {
  const client = useQueryClient()
  const userId = useSessionStore((s) => s.userId)
  return useMutation({
    mutationFn: ({ name, input }: SaveVars) => api.tablePreferences.save(tableKey!, name, input),
    onSuccess: (saved, { silent }) => {
      client.setQueryData<TableView[]>(tablePreferenceKeys.table(userId, tableKey!), (current) => {
        const others = (current ?? []).filter((view) => view.name !== saved.name)
        // Marcar uma visão como inicial desmarca as outras no servidor; o cache acompanha.
        const rest = saved.isDefault ? others.map((view) => ({ ...view, isDefault: false })) : others
        return [...rest, saved].sort(byName)
      })
      if (!silent) notifySuccess("Visão salva.")
    },
    onError: (error, { silent }) => {
      if (!silent) notifyError(error)
    },
  })
}

export function useDeleteTableView(tableKey: string | undefined) {
  const client = useQueryClient()
  const userId = useSessionStore((s) => s.userId)
  return useMutation({
    mutationFn: (name: string) => api.tablePreferences.remove(tableKey!, name),
    onSuccess: (_result, name) => {
      client.setQueryData<TableView[]>(tablePreferenceKeys.table(userId, tableKey!), (current) => (current ?? []).filter((view) => view.name !== name))
      notifySuccess("Visão excluída.")
    },
    onError: (error) => {
      notifyError(error)
      void client.invalidateQueries({ queryKey: tablePreferenceKeys.table(userId, tableKey!) })
    },
  })
}

/** `default` primeiro, depois por nome (mesma ordem da API). */
const byName = (a: TableView, b: TableView) =>
  a.name === "default" ? -1 : b.name === "default" ? 1 : a.name.localeCompare(b.name, "pt-BR")
