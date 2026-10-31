import { describe, expect, it, vi } from "vitest"

import { buildMenu, type ItemNode } from "@/shared/ui/entity-menu/lib/build-menu"

import { columnActions, filterControlSelector, filterSelector, type ColumnActionsInput } from "../lib/column-actions"

const base = (patch: Partial<ColumnActionsInput> = {}): ColumnActionsInput => ({
  label: "Vencimento",
  canSort: true,
  sorted: false,
  canHide: true,
  hasFilter: true,
  hiddenCount: 0,
  onSort: vi.fn(),
  onHide: vi.fn(),
  onFilter: vi.fn(),
  onShowAll: vi.fn(),
  ...patch,
})

const menu = (input: ColumnActionsInput) => buildMenu(columnActions(input), () => true)
const ids = (input: ColumnActionsInput) => menu(input).map((node) => node.id)

describe("menu do cabeçalho de coluna", () => {
  it("coluna ordenável, ocultável e filtrável oferece ordenar, filtrar e ocultar", () => {
    expect(ids(base())).toEqual(["sort-asc", "sort-desc", "separator-1", "filter", "hide"])
  })

  it("só oferece 'Remover ordenação' quando a coluna está ordenada e sinaliza a direção atual", () => {
    expect(ids(base({ sorted: false }))).not.toContain("sort-clear")
    const nodes = menu(base({ sorted: "asc" }))
    expect(nodes.map((node) => node.id)).toContain("sort-clear")
    const asc = nodes.find((node) => node.id === "sort-asc") as ItemNode
    expect(asc.disabled).toBe(true)
    expect(asc.disabledReason).toContain("crescente")
    expect((nodes.find((node) => node.id === "sort-desc") as ItemNode).disabled).toBe(false)
  })

  it("coluna sem ordenação, sem filtro e fixa só tem o que se aplica", () => {
    expect(ids(base({ canSort: false, hasFilter: false, canHide: false }))).toEqual([])
    expect(ids(base({ canSort: false, hasFilter: false, canHide: true }))).toEqual(["hide"])
    expect(ids(base({ canSort: false, canHide: false }))).toEqual(["filter"])
  })

  it("'Mostrar todas as colunas' aparece só com colunas ocultas", () => {
    expect(ids(base({ hiddenCount: 0 }))).not.toContain("show-all")
    expect(ids(base({ hiddenCount: 2 }))).toContain("show-all")
  })

  it("cada item chama o callback certo", () => {
    const input = base({ sorted: "desc", hiddenCount: 1 })
    for (const node of menu(input)) if (node.type === "item" && node.action.kind !== "copy") void node.action.onSelect()
    expect(input.onSort).toHaveBeenCalledWith("asc")
    expect(input.onSort).toHaveBeenCalledWith(false)
    expect(input.onFilter).toHaveBeenCalledTimes(1)
    expect(input.onHide).toHaveBeenCalledTimes(1)
    expect(input.onShowAll).toHaveBeenCalledTimes(1)
  })
})

describe("localizar o controle de filtro da coluna", () => {
  it("o seletor usa o id da coluna do filtro, escapando aspas", () => {
    expect(filterSelector("status")).toBe('[data-filter-id="status"]')
    expect(filterSelector('a"b')).toBe('[data-filter-id="a\\"b"]')
  })

  it("procura botão, campo, select e combobox dentro do wrapper do filtro", () => {
    const selector = filterControlSelector("dueDate")
    for (const control of ["button", "input", "select", "[role=combobox]"]) expect(selector).toContain(`[data-filter-id="dueDate"] ${control}`)
  })
})
