import { afterEach, beforeEach, vi } from "vitest"

import type { Role, User } from "@/domain/types"
import { useSessionStore } from "@/shared/lib/session-store"

/** API Hono simulada: cada rota responde o que o backend devolve de fato; as chamadas ficam registradas. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>
export interface Call {
  method: string
  path: string
  search: URLSearchParams
  body: Json
  headers: Record<string, string>
}

export const reply = (status: number, body?: unknown) => ({ __reply: status, body })
const isReply = (value: unknown): value is ReturnType<typeof reply> => typeof value === "object" && value !== null && "__reply" in value

export const denied = reply(403, { error: { code: "forbidden", message: "forbidden" } })

export let routes: Record<string, unknown> = {}
export let calls: Call[] = []
export const callsTo = (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key)

export function installFakeApi() {
  beforeEach(() => {
    routes = {}
    calls = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
        const target = new URL(url, "http://clinic.test")
        const call: Call = {
          method: init.method ?? "GET",
          path: target.pathname.replace("/api/v1", ""),
          search: target.searchParams,
          body: init.body ? JSON.parse(String(init.body)) : {},
          headers: init.headers,
        }
        calls.push(call)
        const handler = routes[`${call.method} ${call.path}`]
        const result = typeof handler === "function" ? handler(call) : handler
        if (result === undefined) {
          return new Response(JSON.stringify({ error: { code: "internal_error", message: `sem rota: ${call.method} ${call.path}` } }), { status: 500 })
        }
        if (isReply(result)) return new Response(result.body === undefined ? "" : JSON.stringify(result.body), { status: result.__reply })
        return new Response(JSON.stringify(result), { status: 200 })
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useSessionStore.getState().signOut()
  })
}

let tokenSeq = 0
/** Token novo por teste: a lista de pacientes é cacheada por token. */
export function signInAs(roles: Role[] = ["admin"], over: Partial<User> = {}) {
  const user: User = { id: "u1", name: "Marina Alves", email: "marina@clinica.com", title: "", roles, ...over }
  useSessionStore.getState().signIn({ user, accessToken: `fake-${++tokenSeq}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
  return user
}
