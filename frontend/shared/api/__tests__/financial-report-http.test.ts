import { describe, expect, it } from "vitest"

import { ForbiddenError, ValidationError } from "@/domain/errors"

import { api } from "../api"
import { reportQueryOf, searchQueryOf, toFinancialReport } from "../financial-report-mappers"
import { calls, callsTo, denied, installFakeApi, reply, routes, signInAs } from "./support/fake-api"

// Relatório, busca e exportação do financeiro contra a API Hono simulada (formatos de backend/specs/financial-report.spec.md).
installFakeApi()

/** O item como `toEntryView` (backend) o devolve. */
const view = (over: Record<string, unknown> = {}) => ({
  id: "3f2a1bcd-0000-4000-8000-000000000000",
  code: "LAN-3F2A1B",
  kind: "income",
  description: "Sessão de psicologia",
  category: "Consulta",
  counterparty: null,
  patientId: null,
  competence: "2026-10",
  dueDate: "2026-10-20",
  amountCents: 10_000,
  paidCents: 4_000,
  balanceCents: 6_000,
  situation: "partial",
  methods: ["pix"],
  cancelledAt: null,
  createdAt: "2026-10-01T12:00:00.000Z",
  ...over,
})

const reportBody = {
  indicators: { receivedCents: 16_000, receivableCents: 15_000, overdueCents: 13_000, expensesCents: 4_000, resultCents: 12_000, averageTicketCents: 5_333, entryCount: 7 },
  series: {
    granularity: "month",
    points: [{ period: "2026-10", incomeCents: 24_000, expenseCents: 4_000, incomeSettledCents: 11_000, expenseSettledCents: 4_000 }],
  },
  bySituation: [
    { situation: "open", count: 1, amountCents: 2_000 },
    { situation: "paid", count: 2, amountCents: 14_000 },
  ],
  byMethod: [{ method: "pix", count: 1, incomeCents: 10_000, expenseCents: 0 }],
  facets: { categories: ["Aluguel", "Consulta"], competences: ["2026-11", "2026-10"] },
}

describe("financeiro — parâmetros da API", () => {
  it("o filtro vira parâmetros da API: listas repetidas e o que está vazio fica de fora", () => {
    expect(reportQueryOf({ from: "2026-10-01", to: "2026-10-31", kind: "income", statuses: ["open", "paid"], methods: ["pix"], categories: ["Aluguel"], q: "  sala ", minCents: 100 })).toEqual({
      from: "2026-10-01", to: "2026-10-31", kind: "income", status: ["open", "paid"], competence: undefined, q: "sala", method: ["pix"], category: ["Aluguel"], minCents: 100, maxCents: undefined,
    })
    expect(reportQueryOf({ q: "   " }).q).toBeUndefined()
    expect(searchQueryOf({}, { page: 3, pageSize: 50, sort: "amount", dir: "desc" })).toMatchObject({ page: 3, pageSize: 50, sort: "amount", dir: "desc" })
  })
})

describe("financeiro — relatório", () => {
  it("lê indicadores, série, distribuições e facetas e envia o filtro atual", async () => {
    signInAs(["finance"])
    routes["GET /financial/report"] = reportBody
    const report = await api.financial.report({ from: "2026-10-01", to: "2026-10-31", statuses: ["overdue", "partial"], methods: ["pix"], categories: ["Aluguel", "Material"], minCents: 5_000 })

    const [call] = callsTo("GET /financial/report")
    expect(call.search.get("from")).toBe("2026-10-01")
    expect(call.search.getAll("status")).toEqual(["overdue", "partial"])
    expect(call.search.getAll("category")).toEqual(["Aluguel", "Material"])
    expect(call.search.get("method")).toBe("pix")
    expect(call.search.get("minCents")).toBe("5000")
    expect(call.search.has("kind")).toBe(false)

    expect(report.indicators).toEqual(reportBody.indicators)
    expect(report.series).toEqual(reportBody.series)
    expect(report.bySituation).toEqual(reportBody.bySituation)
    expect(report.byMethod).toEqual(reportBody.byMethod)
    expect(report.facets).toEqual(reportBody.facets)
  })

  it("resposta incompleta ou com valores desconhecidos não derruba a tela", () => {
    const report = toFinancialReport({
      indicators: { receivedCents: "12" },
      series: { granularity: "semana", points: [null, { period: "2026-10" }] },
      bySituation: [{ situation: "atrasado", count: 2 }],
      byMethod: [{ method: "bitcoin", count: 1, incomeCents: 5 }],
    })
    expect(report.indicators).toMatchObject({ receivedCents: 12, resultCents: 0, entryCount: 0 })
    expect(report.series).toEqual({ granularity: "month", points: [{ period: "2026-10", incomeCents: 0, expenseCents: 0, incomeSettledCents: 0, expenseSettledCents: 0 }] })
    expect(report.bySituation[0]).toMatchObject({ situation: "open", count: 2 })
    expect(report.byMethod[0]).toMatchObject({ method: "other", incomeCents: 5 })
    expect(report.facets).toEqual({ categories: [], competences: [] })
    expect(toFinancialReport({}).series.granularity).toBe("month")
  })

  it("403 vira ForbiddenError e 422 vira ValidationError com a mensagem da API", async () => {
    signInAs(["reception"])
    routes["GET /financial/report"] = denied
    await expect(api.financial.report({})).rejects.toBeInstanceOf(ForbiddenError)
    routes["GET /financial/report"] = reply(422, { error: { code: "validation_error", message: "Data inicial inválida (use AAAA-MM-DD)." } })
    await expect(api.financial.report({ from: "x" })).rejects.toThrow(new ValidationError("Data inicial inválida (use AAAA-MM-DD)."))
  })
})

describe("financeiro — busca paginada", () => {
  it("envia página, tamanho e ordenação e usa a situação, o pago e o saldo derivados pela API", async () => {
    signInAs(["finance"])
    routes["GET /financial/entries/search"] = {
      items: [view(), view({ id: "e2", code: "LAN-E2", kind: "expense", situation: "overdue", paidCents: 0, balanceCents: 10_000, methods: [], dueDate: "2026-10-01" })],
      total: 45,
      page: 3,
      pageSize: 20,
    }
    const page = await api.financial.search({ kind: "income", q: "sessão" }, { page: 3, pageSize: 20, sort: "balance", dir: "desc" })

    const [call] = callsTo("GET /financial/entries/search")
    expect(Object.fromEntries(call.search)).toMatchObject({ kind: "income", q: "sessão", page: "3", pageSize: "20", sort: "balance", dir: "desc" })

    expect(page).toMatchObject({ total: 45, page: 3, pageSize: 20 })
    expect(page.items).toHaveLength(2)
    expect(page.items[0]).toMatchObject({ status: "partial", paidCents: 4_000, balanceCents: 6_000, methods: ["pix"] })
    expect(page.items[0].entry).toMatchObject({ id: "3f2a1bcd-0000-4000-8000-000000000000", code: "LAN-3F2A1B", kind: "income", amountCents: 10_000, dueDate: "2026-10-20", competence: "2026-10", counterparty: undefined, cancelledAt: undefined })
    expect(page.items[1]).toMatchObject({ status: "overdue", balanceCents: 10_000, methods: [], entry: { code: "LAN-E2", kind: "expense" } })
  })

  it("página vazia e formas desconhecidas", async () => {
    signInAs(["finance"])
    routes["GET /financial/entries/search"] = { items: [view({ methods: ["pix", "bitcoin"], situation: "atrasado" })], total: 1, page: 1, pageSize: 20 }
    const page = await api.financial.search({}, { page: 1, pageSize: 20, sort: "dueDate", dir: "asc" })
    expect(page.items[0]).toMatchObject({ methods: ["pix", "other"], status: "open" })
    routes["GET /financial/entries/search"] = { items: [], total: 0, page: 1, pageSize: 20 }
    expect(await api.financial.search({}, { page: 1, pageSize: 20, sort: "dueDate", dir: "asc" })).toEqual({ items: [], total: 0, page: 1, pageSize: 20 })
  })
})

describe("financeiro — exportação", () => {
  it("busca todas as linhas do filtro atual, sem paginação, e junta o nome do paciente", async () => {
    signInAs(["finance"])
    routes["GET /financial/export"] = { items: [view({ patientId: "p1" }), view({ id: "e2", patientId: "p-desconhecido" })], total: 2 }
    routes["GET /patients"] = { items: [{ id: "p1", code: "7", fullName: "Ana Souza", birthDate: "2015-01-01", status: "active", createdAt: "2026-01-01T00:00:00.000Z" }] }
    const result = await api.financial.export({ from: "2026-10-01", to: "2026-10-31", statuses: ["overdue"] })

    const [call] = callsTo("GET /financial/export")
    expect(call.search.get("from")).toBe("2026-10-01")
    expect(call.search.getAll("status")).toEqual(["overdue"])
    expect(call.search.has("page")).toBe(false)
    expect(call.search.has("pageSize")).toBe(false)

    expect(result.total).toBe(2)
    expect(result.rows.map((r) => r.entry.id)).toEqual(["3f2a1bcd-0000-4000-8000-000000000000", "e2"])
    expect(result.patientNames).toEqual({ p1: "Ana Souza" })
  })

  it("sem lançamento com paciente nem consulta a lista de pacientes; sem acesso a pacientes a exportação segue", async () => {
    signInAs(["finance"])
    routes["GET /financial/export"] = { items: [view()], total: 1 }
    expect((await api.financial.export({})).patientNames).toEqual({})
    expect(callsTo("GET /patients")).toHaveLength(0)

    routes["GET /financial/export"] = { items: [view({ patientId: "p1" })], total: 1 }
    routes["GET /patients"] = denied
    expect((await api.financial.export({})).patientNames).toEqual({})
    expect(calls.some((c) => c.path === "/financial/export")).toBe(true)
  })

  it("quem não tem finance:export recebe a mensagem de acesso negado, em pt-BR", async () => {
    signInAs(["manager"])
    routes["GET /financial/export"] = denied
    await expect(api.financial.export({})).rejects.toThrow(new ForbiddenError("Seu perfil não pode exportar o financeiro."))
  })

  it("filtro grande demais (422) mostra a mensagem da API", async () => {
    signInAs(["finance"])
    routes["GET /financial/export"] = reply(422, { error: { code: "validation_error", message: "A exportação aceita até 10.000 lançamentos. Refine o período ou os filtros." } })
    await expect(api.financial.export({})).rejects.toThrow("Refine o período")
  })
})
