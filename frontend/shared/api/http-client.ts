import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors"
import { hasActiveSession, useSessionStore } from "@/shared/lib/session-store"

/** Sempre caminho relativo: frontend e API ficam atrás do mesmo domínio (sem CORS, sem base URL). */
const API_PREFIX = "/api/v1"

export const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Entre novamente."

/** Falha que não é de domínio (rede, 5xx): o React Query tenta de novo e a UI mostra a mensagem genérica. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  query?: Record<string, QueryValue>
  body?: unknown
  /** Mensagem por status HTTP, para trocar o texto genérico por algo específico da operação. */
  errors?: Partial<Record<number, string>>
  /** `false` nas rotas públicas (login): sem token e sem tratamento de sessão expirada. */
  authenticated?: boolean
  /** Token explícito (ex.: logout depois de limpar a sessão local). */
  token?: string | null
}

interface ErrorPayload {
  error?: { code?: string; message?: string }
}

/** O backend responde `message` com o token interno do erro (`validation`, `not_found`…) quando não há texto próprio. */
const CODE_MESSAGES: Record<string, string> = {
  validation_error: "Dados inválidos. Revise as informações e tente novamente.",
  not_found: "Registro não encontrado.",
  conflict: "Esta operação conflita com outro registro.",
  professional_busy: "O profissional já tem um atendimento neste horário.",
  room_busy: "A sala já está ocupada neste horário.",
  unauthorized: SESSION_EXPIRED_MESSAGE,
}

const isInternalToken = (message: string) => /^[a-z_]+$/.test(message)

function buildUrl(path: string, query: RequestOptions["query"]) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
  }
  const qs = params.toString()
  return `${API_PREFIX}${path}${qs ? `?${qs}` : ""}`
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function currentToken() {
  const state = useSessionStore.getState()
  if (hasActiveSession(state)) return state.accessToken
  if (state.accessToken) state.signOut()
  return null
}

function toDomainError(status: number, payload: ErrorPayload | undefined, options: RequestOptions): Error {
  const code = payload?.error?.code
  const raw = payload?.error?.message ?? ""
  const message =
    options.errors?.[status] ?? (raw && !isInternalToken(raw) ? raw : ((code && CODE_MESSAGES[code]) || undefined))

  if (status === 401) {
    if (options.authenticated === false) return new ValidationError(message ?? "E-mail ou senha incorretos.")
    useSessionStore.getState().signOut()
    return new ForbiddenError(SESSION_EXPIRED_MESSAGE)
  }
  if (status === 400 || status === 422 || status === 429) {
    return new ValidationError(message ?? CODE_MESSAGES.validation_error)
  }
  if (status === 403) return new ForbiddenError(message)
  if (status === 404) return new NotFoundError(message ?? CODE_MESSAGES.not_found)
  if (status === 409) {
    const text = message ?? CODE_MESSAGES.conflict
    return new ConflictError(text, [{ type: code ?? "conflict", message: text }])
  }
  return new ApiError(message ?? "Falha ao acessar os dados.", status, code)
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  if (options.authenticated !== false) {
    const token = options.token !== undefined ? options.token : currentToken()
    if (!token) throw new ForbiddenError(SESSION_EXPIRED_MESSAGE)
    headers.Authorization = `Bearer ${token}`
  }
  if (options.body !== undefined) headers["Content-Type"] = "application/json"

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    })
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor.", 0)
  }

  const payload = await readPayload(response)
  if (!response.ok) throw toDomainError(response.status, payload as ErrorPayload | undefined, options)
  return payload as T
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>("POST", path, options),
  put: <T>(path: string, options?: RequestOptions) => request<T>("PUT", path, options),
  patch: <T>(path: string, options?: RequestOptions) => request<T>("PATCH", path, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
}
