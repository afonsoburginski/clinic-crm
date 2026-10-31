import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors"
import type { User } from "@/domain/types"
import { useSessionStore } from "@/shared/lib/session-store"

import { ApiError, http } from "../http-client"

const user: User = { id: "u1", name: "Marina", email: "m@clinica.com", title: "Administrador", roles: ["admin"] }
const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString()

const fetchMock = vi.fn()
const reply = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body), { status }))
const failure = (code: string, message: string) => ({ error: { code, message } })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rejection = (promise: Promise<unknown>) => promise.then(() => Promise.reject(new Error("a chamada deveria falhar")), (error: any) => error)

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  useSessionStore.getState().signIn({ user, accessToken: "tok-1", expiresAt: inOneHour() })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useSessionStore.getState().signOut()
})

describe("http-client — requisição", () => {
  it("chama caminho relativo com Bearer e descarta parâmetros vazios", async () => {
    reply(200, { items: [] })
    await http.get("/appointments", { query: { from: "2030-01-01", to: "", professionalId: undefined, status: null } })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/v1/appointments?from=2030-01-01")
    expect(init.method).toBe("GET")
    expect(init.headers.Authorization).toBe("Bearer tok-1")
    expect(init.body).toBeUndefined()
  })

  it("serializa o corpo como JSON", async () => {
    reply(200, { id: "p1" })
    await http.post("/patients", { body: { fullName: "Ana Souza" } })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers["Content-Type"]).toBe("application/json")
    expect(JSON.parse(init.body)).toEqual({ fullName: "Ana Souza" })
  })

  it("sem sessão não chama a API", async () => {
    useSessionStore.getState().signOut()
    await expect(http.get("/patients")).rejects.toBeInstanceOf(ForbiddenError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("token vencido encerra a sessão local sem chamar a API", async () => {
    useSessionStore.getState().signIn({ user, accessToken: "tok-1", expiresAt: new Date(Date.now() - 1000).toISOString() })
    await expect(http.get("/patients")).rejects.toBeInstanceOf(ForbiddenError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(useSessionStore.getState().accessToken).toBeNull()
  })

  it("rota pública (login) não envia Authorization", async () => {
    reply(200, { ok: true })
    await http.post("/auth/login", { body: {}, authenticated: false })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
})

describe("http-client — erros da API viram erros de domínio", () => {
  it("422 → ValidationError, com texto amigável no lugar do token interno", async () => {
    reply(422, failure("validation_error", "validation"))
    const error = await rejection(http.post("/patients"))
    expect(error).toBeInstanceOf(ValidationError)
    expect(error.message).toMatch(/Dados inválidos/)
  })

  it("mensagem própria do backend é preservada", async () => {
    reply(422, failure("validation_error", "Informe o motivo."))
    await expect(http.post("/x")).rejects.toThrow("Informe o motivo.")
  })

  it("403 → ForbiddenError", async () => {
    reply(403, failure("forbidden", "forbidden"))
    const error = await rejection(http.get("/audit"))
    expect(error).toBeInstanceOf(ForbiddenError)
    expect(error.message).toMatch(/permissão/)
  })

  it("404 → NotFoundError, com mensagem da operação quando informada", async () => {
    reply(404, failure("not_found", "not_found"))
    const error = await rejection(http.get("/patients/x", { errors: { 404: "Paciente não encontrado." } }))
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error.message).toBe("Paciente não encontrado.")
  })

  it("404 sem corpo JSON (rota inexistente) também é NotFoundError", async () => {
    reply(404, "404 Not Found")
    await expect(http.patch("/guardians/x")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("409 → ConflictError com o motivo do conflito", async () => {
    reply(409, failure("professional_busy", "professional_busy"))
    const error = await rejection(http.post("/appointments"))
    expect(error).toBeInstanceOf(ConflictError)
    expect(error.conflicts).toEqual([{ type: "professional_busy", message: "O profissional já tem um atendimento neste horário." }])
  })

  it("401 fora do login encerra a sessão e pede novo acesso", async () => {
    reply(401, failure("unauthorized", "unauthorized"))
    const error = await rejection(http.get("/patients"))
    expect(error).toBeInstanceOf(ForbiddenError)
    expect(error.message).toMatch(/sessão expirou/)
    expect(useSessionStore.getState().accessToken).toBeNull()
  })

  it("401 e 429 no login viram ValidationError e não mexem na sessão", async () => {
    reply(401, failure("invalid_credentials", "E-mail ou senha incorretos."))
    await expect(http.post("/auth/login", { authenticated: false })).rejects.toThrow(ValidationError)
    reply(429, failure("login_locked", "Acesso bloqueado por 5 minutos após tentativas inválidas."))
    await expect(http.post("/auth/login", { authenticated: false })).rejects.toThrow(/bloqueado/)
    expect(useSessionStore.getState().accessToken).toBe("tok-1")
  })

  it("5xx e falha de rede → ApiError (não é erro de domínio)", async () => {
    reply(500, failure("internal_error", "Falha ao acessar os dados."))
    const server = await rejection(http.get("/patients"))
    expect(server).toBeInstanceOf(ApiError)
    expect(server.status).toBe(500)

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    const network = await rejection(http.get("/patients"))
    expect(network).toBeInstanceOf(ApiError)
    expect(network.status).toBe(0)
  })
})
