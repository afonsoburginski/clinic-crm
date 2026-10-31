"use client"

import { Button } from "@/components/ui/button"
import type { FinancialQueryFilters } from "@/shared/api/api"
import { DateRangePicker, type DateRangeValue } from "@/shared/ui/date-range-picker"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

import { describeFilters, hasActiveFilters } from "../lib/filters"

/**
 * Barra fixa sobre indicadores e gráficos: o período (o filtro de vencimento da tabela, o mesmo estado) e o resumo
 * do que está filtrado. Os demais filtros ficam na toolbar da tabela, mas valem para a página inteira.
 */
export function FinancialFilterBar({
  period,
  filters,
  total,
  onPeriodChange,
  onClear,
}: {
  period: DateRangeValue | undefined
  filters: FinancialQueryFilters
  /** Lançamentos que casam com o filtro (do relatório); `undefined` enquanto carrega. */
  total: number | undefined
  onPeriodChange: (period: DateRangeValue) => void
  onClear: () => void
}) {
  const { from, to, ...others } = filters
  const extra = describeFilters(others)
  const count = total === undefined ? "Carregando…" : total === 1 ? "1 lançamento" : `${total} lançamentos`
  return (
    <Toolbar variant="bar" label="Período e filtros do financeiro">
      <ToolbarGroup>
        <DateRangePicker label="Vencimento" value={period} onChange={onPeriodChange} />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {[count, ...extra].join(" · ")}
        </p>
      </ToolbarGroup>
      {(hasActiveFilters(filters) || from || to) && (
        <ToolbarGroup>
          <Button variant="ghost" onClick={onClear}>
            Limpar filtros
          </Button>
        </ToolbarGroup>
      )}
    </Toolbar>
  )
}
