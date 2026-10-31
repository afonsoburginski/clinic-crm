import { ForbiddenError, ValidationError } from "@/domain/errors"
import type { User } from "@/domain/types"
import { useSessionStore } from "@/shared/lib/session-store"

import type { Row } from "./backend-mappers"
import { SESSION_EXPIRED_MESSAGE, http } from "./http-client"
import { knownUserName } from "./user-directory"

/** Utilitários comuns dos adaptadores HTTP (`api.ts`, `clinical-api.ts`, `financial-api.ts`, `documents-api.ts`). */

export const seg = encodeURIComponent

/** GET de coleção: a API responde `{ items }`. */
export async function items(path: string, query?: Record<string, string | undefined>) {
  const body = await http.get<{ items?: Row[] }>(path, { query })
  return body.items ?? []
}

/** Perfis sem acesso a um recurso opcional recebem o valor neutro em vez de derrubar a tela inteira. */
export const whenForbidden =
  <T>(fallback: T) =>
  (error: unknown) => {
    if (error instanceof ForbiddenError) return fallback
    throw error
  }

export function blankToUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj }
  for (const key of Object.keys(out)) {
    if (out[key] === "") (out as Record<string, unknown>)[key] = undefined
  }
  return out
}

export function parse<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } },
  input: unknown
): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new ValidationError(result.error?.issues[0]?.message ?? "Dados inválidos")
  return result.data as T
}

export const now = () => new Date().toISOString()

/** Identificador gerado no cliente quando a API guarda o id que recebe (ex.: indisponibilidades). */
export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

/** Usuário da sessão (snapshot da API); sem ele a sessão expirou. */
export function currentUser(): User {
  const user = useSessionStore.getState().user
  if (!user) throw new ForbiddenError(SESSION_EXPIRED_MESSAGE)
  return user
}

/**
 * A API guarda só o id de quem agiu em eventos, pagamentos e interpretações. O nome vem do usuário da sessão
 * e, para quem tem `users:read`, da lista de usuários (`user-directory.ts`); os demais aparecem com um rótulo neutro.
 */
export function actorNameOf(actorId: string | undefined) {
  const me = useSessionStore.getState().user
  if (actorId && me?.id === actorId) return me.name
  return knownUserName(actorId) ?? "Usuário da clínica"
}
