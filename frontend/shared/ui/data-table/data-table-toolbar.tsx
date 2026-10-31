"use client"

import { Search, X } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/shared/ui/atoms/text-input"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

import { FilterControl } from "./filters/filter-controls"
import { activeFilters } from "./lib/filters"
import type { FilterSpec, FilterState, FilterValue } from "./lib/types"

const SEARCH_DEBOUNCE_MS = 250

/** Busca global (com debounce), filtros declarativos por coluna, chips dos filtros ativos e ações extras. */
export function DataTableToolbar<T>({
  label,
  search,
  searchPlaceholder,
  specs,
  filters,
  counts,
  onSearchChange,
  onFilterChange,
  onClear,
  leading,
  trailing,
}: {
  label: string
  search: string
  searchPlaceholder: string
  specs: FilterSpec<T>[]
  filters: FilterState
  counts: Record<string, Record<string, number>>
  onSearchChange: (value: string) => void
  onFilterChange: (id: string, value: FilterValue | undefined) => void
  onClear: () => void
  /** Antes da busca (raro). */
  leading?: React.ReactNode
  /** Controles à direita: colunas, visões e ações da tela (ex.: exportar). */
  trailing?: React.ReactNode
}) {
  const [draft, setDraft] = useState(search)
  // Mudanças externas (visão aplicada, "limpar tudo") entram no campo; digitar sobe com debounce.
  useEffect(() => setDraft(search), [search])
  useEffect(() => {
    if (draft === search) return
    const timer = setTimeout(() => onSearchChange(draft), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o texto digitado dispara o debounce
  }, [draft])

  const chips = activeFilters(specs, filters)
  const anyActive = chips.length > 0 || search.trim() !== ""

  return (
    <div data-slot="data-table-toolbar">
      <Toolbar label={label} className="sm:items-start">
        <ToolbarGroup className="w-full sm:flex-1">
          {leading}
          <Input
            type="search"
            aria-label={`Buscar em ${label.toLowerCase()}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={searchPlaceholder}
            leadingSlot={<Search aria-hidden />}
            shellClassName="w-full sm:max-w-xs"
          />
          {specs.map((spec) => (
            <FilterControl key={spec.id} config={spec.config} value={filters[spec.id]} counts={counts[spec.id]} onChange={(value) => onFilterChange(spec.id, value)} />
          ))}
        </ToolbarGroup>
        {trailing && <ToolbarGroup align="end">{trailing}</ToolbarGroup>}
      </Toolbar>
      {anyActive && (
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2" aria-label="Filtros ativos">
          {chips.map((chip) => (
            <span key={chip.id} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted pr-1 pl-2.5 text-xs">
              {chip.text}
              <button
                type="button"
                aria-label={`Remover filtro: ${chip.text}`}
                onClick={() => onFilterChange(chip.id, undefined)}
                className="inline-flex size-4 items-center justify-center rounded-full outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <Button type="button" variant="ghost" size="xs" onClick={onClear}>
            Limpar tudo
          </Button>
        </div>
      )}
    </div>
  )
}
