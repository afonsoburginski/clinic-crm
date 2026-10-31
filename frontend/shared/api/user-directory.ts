import { can } from "@/domain/permissions"
import { useSessionStore } from "@/shared/lib/session-store"

import type { Row } from "./backend-mappers"
import { http } from "./http-client"

/**
 * Nomes de usuários para mostrar autor/ator (a API guarda só o id). Só quem tem `users:read` consegue listar;
 * os demais perfis seguem com o rótulo neutro, sem fazer a chamada.
 */
const TTL_MS = 60_000

let cache: { token: string | null; at: number; names: Promise<Map<string, string>> } | null = null
let known = new Map<string, string>()

/** Resolve o nome já carregado (síncrono): é o que os mappers usam. */
export const knownUserName = (id: string | undefined) => (id ? known.get(id) : undefined)

export function ensureUserNames(): Promise<Map<string, string>> {
  const { user, accessToken } = useSessionStore.getState()
  if (!can(user, "users:read")) {
    known = new Map()
    return Promise.resolve(new Map())
  }
  if (cache && cache.token === accessToken && Date.now() - cache.at < TTL_MS) return cache.names
  const names = http
    .get<{ items?: Row[] }>("/users")
    .then((body) => new Map((body.items ?? []).map((row) => [String(row.id), String(row.name ?? "")] as const)))
    // Falha na lista não pode derrubar a tela que só queria um nome: segue com o rótulo neutro.
    .catch(() => new Map<string, string>())
    .then((map) => {
      known = map
      return map
    })
  cache = { token: accessToken, at: Date.now(), names }
  return names
}

export function invalidateUserNames() {
  cache = null
}

export function resetUserNames() {
  cache = null
  known = new Map()
}
