import { describe, expect, it } from "vitest"

import type { TableView } from "@/shared/api/table-preferences-mappers"

import {
  DEFAULT_VIEW,
  SEARCH_KEY,
  applyView,
  resolveInitialState,
  viewName,
  viewPayload,
  workingChanged,
  workingPayload,
  type ViewContext,
} from "../views"
import { emptyState, type FilterSpec } from "../types"

interface Row { status: string; amount: number }
const specs: FilterSpec<Row>[] = [
  { id: "status", config: { kind: "multiselect", label: "Situação", options: [{ value: "open", label: "Aberto" }, { value: "paid", label: "Pago" }], value: (r) => r.status } },
  { id: "amount", config: { kind: "money", label: "Valor", value: (r) => r.amount } },
]
const ctx: ViewContext<Row> = { columnIds: ["description", "status", "amount", "due"], specs }

const view = (over: Partial<TableView> = {}): TableView => ({
  name: "Pendentes",
  pageSize: 50,
  sort: [{ id: "due", desc: true }],
  hiddenColumns: ["description"],
  columnOrder: ["status", "amount"],
  filters: { status: ["open"], amount: { min: 1000 }, [SEARCH_KEY]: "ana" },
  isDefault: false,
  updatedAt: "",
  ...over,
})

describe("serialização", () => {
  const state = emptyState({
    search: "  ana ",
    filters: { status: ["open"], amount: { min: 1000 } },
    sort: [{ id: "due", desc: true }],
    pageIndex: 3,
    pageSize: 50,
    hiddenColumns: ["description"],
    columnOrder: ["status", "amount"],
  })

  it("a visão nomeada leva busca e filtros ativos, sem a página atual", () => {
    expect(viewPayload(state)).toEqual({
      pageSize: 50,
      sort: [{ id: "due", desc: true }],
      hiddenColumns: ["description"],
      columnOrder: ["status", "amount"],
      filters: { status: ["open"], amount: { min: 1000 }, [SEARCH_KEY]: "ana" },
    })
    expect(viewPayload(state, true).isDefault).toBe(true)
    expect(JSON.stringify(viewPayload(state))).not.toContain("pageIndex")
  })

  it("as preferências de trabalho nunca levam busca nem filtros", () => {
    expect(workingPayload(state).filters).toEqual({})
  })

  it("filtro vazio não é gravado", () => {
    expect(viewPayload(emptyState({ filters: { status: [] } })).filters).toEqual({})
  })
})

describe("aplicar uma visão", () => {
  it("restaura tudo e volta para a primeira página", () => {
    const next = applyView(emptyState({ pageIndex: 4 }), view(), ctx)
    expect(next).toMatchObject({
      search: "ana",
      filters: { status: ["open"], amount: { min: 1000 } },
      sort: [{ id: "due", desc: true }],
      pageIndex: 0,
      pageSize: 50,
      hiddenColumns: ["description"],
      columnOrder: ["status", "amount"],
    })
  })

  it("descarta coluna removida, filtro desconhecido ou malformado e tamanho de página inválido", () => {
    const next = applyView(
      emptyState({ pageSize: 20 }),
      view({
        pageSize: 77,
        sort: [{ id: "gone", desc: false }],
        hiddenColumns: ["gone", "status"],
        columnOrder: ["gone"],
        filters: { removed: ["x"], status: "open", amount: { min: "5" } },
      }),
      ctx
    )
    expect(next.pageSize).toBe(20)
    expect(next.sort).toEqual([])
    expect(next.hiddenColumns).toEqual(["status"])
    expect(next.columnOrder).toEqual([])
    expect(next.filters).toEqual({})
    expect(next.search).toBe("")
  })
})

describe("estado inicial ao abrir a tela", () => {
  const defaults = emptyState({ filters: { status: ["open"] }, pageSize: 20 })

  it("sem nada salvo vale o padrão da tela", () => {
    expect(resolveInitialState([], defaults, ctx)).toEqual(defaults)
  })

  it("as preferências de trabalho entram sem apagar os filtros padrão da tela", () => {
    const prefs = view({ name: DEFAULT_VIEW, filters: {}, pageSize: 100, hiddenColumns: ["due"], sort: [] })
    const state = resolveInitialState([prefs], defaults, ctx)
    expect(state).toMatchObject({ pageSize: 100, hiddenColumns: ["due"], filters: { status: ["open"] }, search: "" })
  })

  it("a visão marcada como inicial sobrepõe tudo, inclusive filtros e busca", () => {
    const prefs = view({ name: DEFAULT_VIEW, filters: {}, pageSize: 100 })
    const initial = view({ name: "Pendentes", isDefault: true, pageSize: 10, filters: { status: ["paid"] } })
    const state = resolveInitialState([prefs, initial], defaults, ctx)
    expect(state).toMatchObject({ pageSize: 10, filters: { status: ["paid"] } })
  })

  it("a visão default não conta como inicial mesmo marcada por engano", () => {
    const state = resolveInitialState([view({ name: DEFAULT_VIEW, isDefault: true, pageSize: 100, filters: { status: ["paid"] } })], defaults, ctx)
    expect(state.filters).toEqual({ status: ["open"] })
  })
})

describe("mudança nas preferências de trabalho", () => {
  const a = emptyState({ pageSize: 20, hiddenColumns: ["x"], sort: [{ id: "a", desc: false }] })
  it("detecta tamanho, colunas, ordem e ordenação, e ignora busca, filtros e página", () => {
    expect(workingChanged(a, { ...a })).toBe(false)
    expect(workingChanged(a, { ...a, search: "x", filters: { status: ["open"] }, pageIndex: 3 })).toBe(false)
    expect(workingChanged(a, { ...a, pageSize: 50 })).toBe(true)
    expect(workingChanged(a, { ...a, hiddenColumns: [] })).toBe(true)
    expect(workingChanged(a, { ...a, columnOrder: ["b"] })).toBe(true)
    expect(workingChanged(a, { ...a, sort: [{ id: "a", desc: true }] })).toBe(true)
    expect(workingChanged(a, { ...a, sort: [] })).toBe(true)
  })

  it("viewName tira espaços repetidos e limita a 40 caracteres", () => {
    expect(viewName("  A   receber  ")).toBe("A receber")
    expect(viewName("x".repeat(60))).toHaveLength(40)
  })
})
