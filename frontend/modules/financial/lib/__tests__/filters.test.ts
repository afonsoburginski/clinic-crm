import { describe, expect, it } from "vitest"

import { emptyState } from "@/shared/ui/data-table/lib/types"

import { defaultFinancialState, describeFilters, filtersFromState, hasActiveFilters, searchParamsFromState } from "../filters"

const state = (filters: Record<string, unknown> = {}, search = "") => ({ filters: filters as never, search })

describe("FIN — filtros da tela → API", () => {
  it("traduz período, situação, forma, categoria, competência, faixa de valor e busca", () => {
    expect(
      filtersFromState(
        state(
          {
            dueDate: { from: "2026-10-01", to: "2026-10-31" },
            kind: ["income"],
            status: ["overdue", "partial"],
            method: ["pix"],
            category: ["Consulta", "Aluguel"],
            competence: "2026-10",
            amount: { min: 10_000, max: 50_000 },
          },
          "  Ana  "
        )
      )
    ).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      kind: "income",
      statuses: ["overdue", "partial"],
      methods: ["pix"],
      categories: ["Consulta", "Aluguel"],
      competence: "2026-10",
      minCents: 10_000,
      maxCents: 50_000,
      q: "Ana",
    })
  })

  it("receita e despesa juntas valem como nenhum filtro de tipo; só a faixa aberta de uma ponta também funciona", () => {
    expect(filtersFromState(state({ kind: ["income", "expense"] })).kind).toBeUndefined()
    expect(filtersFromState(state({ kind: ["expense"] })).kind).toBe("expense")
    expect(filtersFromState(state({ amount: { min: 500 } }))).toEqual({ minCents: 500 })
    expect(filtersFromState(state({ dueDate: { from: "2026-10-01" } }))).toEqual({ from: "2026-10-01" })
  })

  it("ignora valores desconhecidos de visões antigas e formas inválidas", () => {
    expect(
      filtersFromState(state({ status: ["late"], method: ["bitcoin"], competence: "2026-13", kind: ["other"], amount: { min: -1, max: Number.NaN }, dueDate: "ontem" }))
    ).toEqual({})
    expect(filtersFromState(state({}, "   "))).toEqual({})
  })

  it("estado vazio é filtro vazio", () => {
    expect(filtersFromState(emptyState())).toEqual({})
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ statuses: [] })).toBe(false)
    expect(hasActiveFilters({ q: "x" })).toBe(true)
  })
})

describe("FIN — paginação e ordenação do servidor", () => {
  it("página da tabela começa em 0, a da API em 1", () => {
    expect(searchParamsFromState({ pageIndex: 0, pageSize: 20, sort: [] })).toEqual({ page: 1, pageSize: 20, sort: "dueDate", dir: "asc" })
    expect(searchParamsFromState({ pageIndex: 2, pageSize: 50, sort: [{ id: "amount", desc: true }] })).toEqual({ page: 3, pageSize: 50, sort: "amount", dir: "desc" })
  })

  it("a coluna Situação ordena pela situação derivada e coluna desconhecida cai no vencimento", () => {
    expect(searchParamsFromState({ pageIndex: 0, pageSize: 20, sort: [{ id: "status", desc: false }] }).sort).toBe("situation")
    expect(searchParamsFromState({ pageIndex: 0, pageSize: 20, sort: [{ id: "naoexiste", desc: true }] })).toMatchObject({ sort: "dueDate", dir: "desc" })
  })
})

describe("FIN — abertura da tela", () => {
  it("abre nos vencimentos do mês corrente, por vencimento crescente", () => {
    const initial = defaultFinancialState("2026-10-31")
    expect(initial.filters).toEqual({ dueDate: { from: "2026-10-01", to: "2026-10-31" } })
    expect(initial.sort).toEqual([{ id: "dueDate", desc: false }])
    expect(initial.hiddenColumns).toEqual(["competence", "paid"])
    expect(filtersFromState(initial)).toEqual({ from: "2026-10-01", to: "2026-10-31" })
  })
})

describe("FIN — texto dos filtros aplicados (aba Resumo)", () => {
  it("descreve cada filtro em pt-BR", () => {
    const lines = describeFilters({
      from: "2026-10-01",
      to: "2026-10-31",
      kind: "expense",
      statuses: ["overdue", "paid"],
      methods: ["pix", "card"],
      categories: ["Aluguel"],
      competence: "2026-10",
      minCents: 10_000,
      maxCents: 250_000,
      q: "sala",
    })
    expect(lines.map((line) => line.replace(/\s/g, " "))).toEqual([
      "Vencimento: 01/10/2026 a 31/10/2026",
      "Tipo: Despesa",
      "Situação: Vencido, Pago",
      "Forma de pagamento: Pix, Cartão",
      "Categoria: Aluguel",
      "Competência: 10/2026",
      "Valor: R$ 100,00 a R$ 2.500,00",
      "Busca: sala",
    ])
  })

  it("pontas abertas e nenhum filtro", () => {
    expect(describeFilters({ from: "2026-10-01" })).toEqual(["Vencimento: a partir de 01/10/2026"])
    expect(describeFilters({ to: "2026-10-31" })).toEqual(["Vencimento: até 31/10/2026"])
    expect(describeFilters({})).toEqual([])
  })
})
