import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, EyeOff, ListFilter } from "lucide-react"

import type { EntityAction } from "@/shared/ui/entity-menu/lib/build-menu"

export interface ColumnActionsInput {
  /** Rótulo pt-BR da coluna (entra nos textos de ajuda). */
  label: string
  canSort: boolean
  sorted: false | "asc" | "desc"
  canHide: boolean
  /** A coluna tem filtro declarado na toolbar. */
  hasFilter: boolean
  /** Quantas colunas estão ocultas agora (habilita "Mostrar todas"). */
  hiddenCount: number
  onSort: (direction: "asc" | "desc" | false) => void
  onHide: () => void
  onFilter: () => void
  onShowAll: () => void
}

/** Menu do cabeçalho de coluna (clique direito e "⋯"): ordenar, ocultar, filtrar e mostrar todas. Feito de `EntityAction`s como qualquer outro menu. */
export function columnActions(input: ColumnActionsInput): EntityAction[] {
  const { label, canSort, sorted } = input
  return [
    { id: "sort-asc", label: "Ordenar crescente", icon: ArrowUp, group: "sort", hidden: !canSort, disabled: sorted === "asc" && `Já ordenado por ${label} (crescente).`, onSelect: () => input.onSort("asc") },
    { id: "sort-desc", label: "Ordenar decrescente", icon: ArrowDown, group: "sort", hidden: !canSort, disabled: sorted === "desc" && `Já ordenado por ${label} (decrescente).`, onSelect: () => input.onSort("desc") },
    { id: "sort-clear", label: "Remover ordenação", icon: ArrowUpDown, group: "sort", hidden: !canSort || !sorted, onSelect: () => input.onSort(false) },
    { id: "filter", label: "Filtrar por esta coluna", icon: ListFilter, group: "view", hidden: !input.hasFilter, onSelect: input.onFilter },
    { id: "hide", label: "Ocultar coluna", icon: EyeOff, group: "view", hidden: !input.canHide, onSelect: input.onHide },
    { id: "show-all", label: "Mostrar todas as colunas", icon: Columns3, group: "view", hidden: input.hiddenCount === 0, onSelect: input.onShowAll },
  ]
}

/** Seletor do wrapper que a toolbar põe em volta de cada filtro (`data-filter-id`). */
export const filterSelector = (id: string) => `[data-filter-id="${id.replace(/["\\]/g, "\\$&")}"]`

const FOCUSABLE = ["button", "input", "select", "[role=combobox]"]

/** Seletor dos controles focáveis dentro do wrapper do filtro. */
export const filterControlSelector = (id: string) => FOCUSABLE.map((control) => `${filterSelector(id)} ${control}`).join(", ")

/**
 * Leva o foco ao controle de filtro da coluna e, se for um botão (popover/select), abre-o.
 * Roda depois que o menu terminou de fechar: abrir no mesmo tick faria o foco devolvido ao gatilho fechar o popover.
 */
export function focusFilterControl(root: ParentNode | null, id: string, delayMs = 120) {
  if (typeof window === "undefined" || !root) return
  window.setTimeout(() => {
    const target = root.querySelector<HTMLElement>(filterControlSelector(id))
    if (!target) return
    target.scrollIntoView?.({ block: "nearest", inline: "nearest" })
    target.focus()
    if (target.tagName === "BUTTON") target.click()
  }, delayMs)
}
