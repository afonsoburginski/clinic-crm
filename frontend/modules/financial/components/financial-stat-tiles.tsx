"use client"

import { HaloCard } from "@/components/ui/halo-card"
import { Skeleton } from "@/components/ui/skeleton"
import type { FinancialReport } from "@/shared/api/api"
import { formatCurrency } from "@/shared/lib/format"
import { ErrorState } from "@/shared/ui/molecules/feedback-states"
import { StatTile } from "@/shared/ui/molecules/stat-tile"

/** RF-FIN-005: receita recebida, a receber, vencido e ticket médio do filtro atual (fórmulas em RN-FIN-013). */
export function FinancialStatTiles({
  report,
  isLoading,
  error,
  onRetry,
}: {
  report?: FinancialReport
  isLoading: boolean
  error: unknown
  onRetry: () => void
}) {
  if (error && !report) {
    return (
      <div className="rounded-xl border bg-card">
        <ErrorState error={error} onRetry={onRetry} className="py-8" />
      </div>
    )
  }
  if (isLoading || !report) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy>
        {[0, 1, 2, 3].map((index) => (
          <HaloCard key={index} padding="sm" translucent={false} aria-label="Carregando indicador">
            <div className="flex flex-col gap-3 p-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          </HaloCard>
        ))}
      </div>
    )
  }
  const { indicators } = report
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Receita recebida"
        value={indicators.receivedCents / 100}
        display={formatCurrency(indicators.receivedCents)}
        hint={`Despesas pagas ${formatCurrency(indicators.expensesCents)} · resultado ${formatCurrency(indicators.resultCents)}`}
      />
      <StatTile
        label="A receber"
        value={indicators.receivableCents / 100}
        display={formatCurrency(indicators.receivableCents)}
        hint="Saldo de receitas abertas ou parciais, ainda não vencidas"
      />
      <StatTile
        label="Vencido"
        value={indicators.overdueCents / 100}
        display={formatCurrency(indicators.overdueCents)}
        hint="Saldo de receitas com vencimento passado"
      />
      <StatTile
        label="Ticket médio"
        value={indicators.averageTicketCents / 100}
        display={formatCurrency(indicators.averageTicketCents)}
        hint="Receita recebida por lançamento de receita com pagamento"
      />
    </div>
  )
}
