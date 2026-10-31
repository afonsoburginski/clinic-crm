import { describe, expect, it } from "vitest"

import {
  activeFilters,
  applyFilters,
  describeFilter,
  facetCounts,
  fold,
  isFilterActive,
  matchesSearch,
  normalizeFilterValue,
  withFilter,
  withoutFilter,
} from "../filters"
import type { FilterSpec } from "../types"

interface Row {
  id: string
  name: string
  status: string
  tags: string[]
  amountCents: number | null
  due: string | null
  days: number
}

const rows: Row[] = [
  { id: "1", name: "José da Silva", status: "open", tags: ["a"], amountCents: 10_000, due: "2026-03-10", days: 2 },
  { id: "2", name: "Maria Souza", status: "paid", tags: ["a", "b"], amountCents: 25_050, due: "2026-03-20", days: 9 },
  { id: "3", name: "Ana Lima", status: "overdue", tags: [], amountCents: 50_000, due: "2026-04-01", days: 15 },
  { id: "4", name: "Bruno Dias", status: "open", tags: ["b"], amountCents: null, due: null, days: 0 },
]

const statusOptions = [
  { value: "open", label: "Aberto" },
  { value: "paid", label: "Pago" },
  { value: "overdue", label: "Vencido" },
]

const specs: FilterSpec<Row>[] = [
  { id: "status", config: { kind: "multiselect", label: "Situação", options: statusOptions, value: (r) => r.status } },
  { id: "pick", config: { kind: "select", label: "Etiqueta", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], value: (r) => r.tags[0] } },
  { id: "amount", config: { kind: "money", label: "Valor", value: (r) => r.amountCents } },
  { id: "days", config: { kind: "range", label: "Dias", unit: "dias", value: (r) => r.days } },
  { id: "due", config: { kind: "date-range", label: "Vencimento", value: (r) => r.due } },
]
const searchText = (r: Row) => `${r.name} ${r.id}`
const ids = (list: Row[]) => list.map((r) => r.id)

describe("busca", () => {
  it("ignora acento e caixa e exige todos os termos", () => {
    expect(fold("JOSÉ Ação")).toBe("jose acao")
    expect(matchesSearch("José da Silva", "jose silva")).toBe(true)
    expect(matchesSearch("José da Silva", "jose souza")).toBe(false)
    expect(matchesSearch("qualquer", "   ")).toBe(true)
  })

  it("applyFilters combina busca e filtros", () => {
    expect(ids(applyFilters(rows, specs, {}, "jose", { searchText }))).toEqual(["1"])
    expect(ids(applyFilters(rows, specs, {}, "ma sou", { searchText }))).toEqual(["2"])
    expect(ids(applyFilters(rows, specs, { status: ["open"] }, "bruno", { searchText }))).toEqual(["4"])
    expect(ids(applyFilters(rows, specs, {}, "", {}))).toEqual(["1", "2", "3", "4"])
  })
})

describe("filtros por tipo", () => {
  it("multiselect: qualquer valor selecionado serve; lista vazia não filtra", () => {
    expect(ids(applyFilters(rows, specs, { status: ["paid", "overdue"] }, ""))).toEqual(["2", "3"])
    expect(ids(applyFilters(rows, specs, { status: [] }, ""))).toHaveLength(4)
  })

  it("select compara com o valor único da linha", () => {
    expect(ids(applyFilters(rows, specs, { pick: "b" }, ""))).toEqual(["4"])
    expect(ids(applyFilters(rows, specs, { pick: "a" }, ""))).toEqual(["1", "2"])
  })

  it("money: faixa em centavos inclui as pontas e exclui linha sem valor", () => {
    expect(ids(applyFilters(rows, specs, { amount: { min: 10_000, max: 25_050 } }, ""))).toEqual(["1", "2"])
    expect(ids(applyFilters(rows, specs, { amount: { min: 30_000 } }, ""))).toEqual(["3"])
    expect(ids(applyFilters(rows, specs, { amount: { max: 10_000 } }, ""))).toEqual(["1"])
  })

  it("range numérico", () => {
    expect(ids(applyFilters(rows, specs, { days: { min: 2, max: 9 } }, ""))).toEqual(["1", "2"])
  })

  it("date-range: ponta aberta e linha sem data", () => {
    expect(ids(applyFilters(rows, specs, { due: { from: "2026-03-10", to: "2026-03-31" } }, ""))).toEqual(["1", "2"])
    expect(ids(applyFilters(rows, specs, { due: { from: "2026-03-15" } }, ""))).toEqual(["2", "3"])
  })

  it("filtros se somam (E)", () => {
    expect(ids(applyFilters(rows, specs, { status: ["open"], amount: { min: 1 } }, ""))).toEqual(["1"])
  })
})

describe("contagens facetadas", () => {
  it("cada opção conta com os outros filtros, sem o próprio", () => {
    expect(facetCounts(rows, specs, "status", {}, "", searchText)).toEqual({ open: 2, paid: 1, overdue: 1 })
    // Filtrar por status não muda a contagem do próprio status, mas outros filtros mudam.
    expect(facetCounts(rows, specs, "status", { status: ["paid"], pick: "a" }, "", searchText)).toEqual({ open: 1, paid: 1, overdue: 0 })
    expect(facetCounts(rows, specs, "status", {}, "silva", searchText)).toEqual({ open: 1, paid: 0, overdue: 0 })
  })

  it("filtros sem opções não têm contagem", () => {
    expect(facetCounts(rows, specs, "amount", {}, "")).toEqual({})
    expect(facetCounts(rows, specs, "inexistente", {}, "")).toEqual({})
  })
})

describe("estado dos filtros", () => {
  it("isFilterActive reconhece vazio em cada forma", () => {
    for (const empty of ["", [], {}, { from: "" }, { min: undefined }, undefined]) expect(isFilterActive(empty as never)).toBe(false)
    for (const set of ["x", ["x"], { min: 0 }, { from: "2026-01-01" }, { to: "2026-01-01" }]) expect(isFilterActive(set as never)).toBe(true)
  })

  it("withFilter grava só o que está ativo e withoutFilter preserva os demais", () => {
    const one = withFilter({}, "status", ["open"])
    expect(one).toEqual({ status: ["open"] })
    expect(withFilter(one, "status", [])).toEqual({})
    expect(withFilter({ ...one, pick: "a" }, "status", undefined)).toEqual({ pick: "a" })
    expect(withoutFilter({ a: "1", b: "2" }, "a")).toEqual({ b: "2" })
  })

  it("normalizeFilterValue sanitiza o que veio de uma visão salva", () => {
    const [status, pick, amount, , due] = specs
    expect(normalizeFilterValue(status.config, ["open", 3, "open", ""])).toEqual(["open"])
    expect(normalizeFilterValue(status.config, "open")).toBeUndefined()
    expect(normalizeFilterValue(pick.config, "a")).toBe("a")
    expect(normalizeFilterValue(pick.config, ["a"])).toBeUndefined()
    expect(normalizeFilterValue(amount.config, { min: 500, max: 100 })).toEqual({ min: 100, max: 500 })
    expect(normalizeFilterValue(amount.config, { min: "5" })).toBeUndefined()
    expect(normalizeFilterValue(due.config, { from: "2026-03-20", to: "2026-03-10" })).toEqual({ from: "2026-03-10", to: "2026-03-20" })
    expect(normalizeFilterValue(due.config, { from: "2026-02-30" })).toBeUndefined()
    expect(normalizeFilterValue(due.config, null)).toBeUndefined()
  })
})

describe("chips dos filtros ativos", () => {
  it("descreve cada tipo em pt-BR", () => {
    const [status, pick, amount, days, due] = specs
    expect(describeFilter(status.config, ["open", "paid"])).toBe("Situação: Aberto, Pago")
    expect(describeFilter(pick.config, "b")).toBe("Etiqueta: B")
    expect(describeFilter(amount.config, { min: 1000, max: 25_050 })).toMatch(/^Valor: R\$\s?10,00 – R\$\s?250,50$/)
    expect(describeFilter(amount.config, { min: 1000 })).toMatch(/^Valor: a partir de R\$\s?10,00$/)
    expect(describeFilter(days.config, { max: 9 })).toBe("Dias: até 9 dias")
    expect(describeFilter(due.config, { from: "2026-03-01", to: "2026-03-31" })).toBe("Vencimento: 01/03/2026 – 31/03/2026")
  })

  it("activeFilters lista só os ativos, na ordem das colunas", () => {
    expect(activeFilters(specs, { due: { from: "2026-03-01" }, status: ["open"] }).map((f) => f.id)).toEqual(["status", "due"])
  })
})
