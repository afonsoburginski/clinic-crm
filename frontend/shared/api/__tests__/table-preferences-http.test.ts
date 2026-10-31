import { describe, expect, it } from "vitest"

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors"

import { api } from "../api"
import { toTableView } from "../table-preferences-mappers"
import { callsTo, denied, installFakeApi, reply, routes, signInAs } from "./support/fake-api"

// Preferências de tabela contra a API Hono simulada.
installFakeApi()

const row = (over: Record<string, unknown> = {}) => ({
  name: "Pendentes",
  pageSize: 50,
  sort: [{ id: "dueDate", desc: true }],
  hiddenColumns: ["code"],
  columnOrder: [],
  filters: { status: ["open"], _search: "ana" },
  isDefault: false,
  updatedAt: "2026-03-01T10:00:00.000Z",
  ...over,
})

describe("mapper de visões", () => {
  it("converte a linha da API e ignora o que não tem forma", () => {
    expect(toTableView(row())).toEqual({
      name: "Pendentes", pageSize: 50, sort: [{ id: "dueDate", desc: true }], hiddenColumns: ["code"], columnOrder: [],
      filters: { status: ["open"], _search: "ana" }, isDefault: false, updatedAt: "2026-03-01T10:00:00.000Z",
    })
    expect(toTableView({ name: "x", pageSize: "50", sort: [1, { id: 3 }, { id: "a" }], hiddenColumns: ["a", 2], filters: [], isDefault: "yes" })).toEqual({
      name: "x", pageSize: null, sort: [{ id: "a", desc: false }], hiddenColumns: ["a"], columnOrder: [], filters: {}, isDefault: false, updatedAt: "",
    })
  })
})

describe("API de preferências de tabela", () => {
  it("list pede as visões da tabela e mapeia", async () => {
    signInAs(["reception"])
    routes["GET /preferences/tables/financial-entries"] = { items: [row({ name: "default" }), row()] }
    const views = await api.tablePreferences.list("financial-entries")
    expect(views.map((v) => v.name)).toEqual(["default", "Pendentes"])
    expect(callsTo("GET /preferences/tables/financial-entries")).toHaveLength(1)
  })

  it("save grava por nome (codificado na URL) e devolve a visão", async () => {
    signInAs(["finance"])
    routes["PUT /preferences/tables/financial-entries/views/A%20receber%20%2F%20hoje"] = (call: { body: Record<string, unknown> }) => row({ name: "A receber / hoje", ...call.body })
    const saved = await api.tablePreferences.save("financial-entries", "A receber / hoje", {
      pageSize: 20, sort: [], hiddenColumns: [], columnOrder: [], filters: { status: ["open"] }, isDefault: true,
    })
    expect(saved).toMatchObject({ name: "A receber / hoje", pageSize: 20, isDefault: true })
    const [call] = callsTo("PUT /preferences/tables/financial-entries/views/A%20receber%20%2F%20hoje")
    expect(call.body).toEqual({ pageSize: 20, sort: [], hiddenColumns: [], columnOrder: [], filters: { status: ["open"] }, isDefault: true })
    expect(call.headers.Authorization).toMatch(/^Bearer /)
  })

  it("erros viram mensagens em pt-BR", async () => {
    signInAs(["reception"])
    routes["PUT /preferences/tables/patients/views/x"] = reply(409, { error: { code: "conflict", message: "conflict" } })
    const conflict = await api.tablePreferences.save("patients", "x", { pageSize: null, sort: [], hiddenColumns: [], columnOrder: [], filters: {} }).catch((e) => e)
    expect(conflict).toBeInstanceOf(ConflictError)
    expect(conflict.message).toBe("Limite de visões salvas atingido. Exclua uma visão para criar outra.")
    routes["PUT /preferences/tables/patients/views/y"] = reply(422, { error: { code: "validation_error", message: "A visão é grande demais para ser salva." } })
    await expect(api.tablePreferences.save("patients", "y", { pageSize: null, sort: [], hiddenColumns: [], columnOrder: [], filters: {} })).rejects.toBeInstanceOf(ValidationError)
  })

  it("remove chama DELETE e trata 404 e 403", async () => {
    signInAs(["reception"])
    routes["DELETE /preferences/tables/patients/views/a"] = { ok: true }
    await expect(api.tablePreferences.remove("patients", "a")).resolves.toBeUndefined()
    routes["DELETE /preferences/tables/patients/views/b"] = reply(404, { error: { code: "not_found", message: "not_found" } })
    await expect(api.tablePreferences.remove("patients", "b")).rejects.toBeInstanceOf(NotFoundError)
    routes["DELETE /preferences/tables/patients/views/c"] = denied
    await expect(api.tablePreferences.remove("patients", "c")).rejects.toBeInstanceOf(ForbiddenError)
  })
})
