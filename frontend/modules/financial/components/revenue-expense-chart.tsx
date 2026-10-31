"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import type { FinancialReport } from "@/shared/api/api"
import { formatCurrency } from "@/shared/lib/format"
import { EmptyState, ErrorState } from "@/shared/ui/molecules/feedback-states"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { compactCurrency, isSeriesEmpty, seriesChartData } from "../lib/chart-data"
import { ChartTable, moneyTooltipRow } from "./chart-shared"

/** Azul do tema para receita, amarelo para despesa: distinguíveis também para daltonismo; nada de roxo. */
const config = {
  incomeCents: { label: "Receita", color: "var(--chart-1)" },
  expenseCents: { label: "Despesa", color: "var(--chart-3)" },
} satisfies ChartConfig

/** RF-FIN-006 (1): receita × despesa por período de vencimento, mensal ou diário conforme o intervalo. */
export function RevenueExpenseChart({
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
  const series = report?.series
  const data = series ? seriesChartData(series) : []
  const description = series?.granularity === "day" ? "Por dia de vencimento · lançamentos não cancelados" : "Por mês de vencimento · lançamentos não cancelados"

  let body: React.ReactNode
  if (error && !report) body = <ErrorState error={error} onRetry={onRetry} className="py-10" />
  else if (isLoading || !series) body = <Skeleton className="h-64 w-full" aria-busy />
  else if (isSeriesEmpty(series)) {
    body = <EmptyState title="Sem lançamentos no filtro" description="Ajuste o período ou os filtros para ver receitas e despesas." className="py-10" />
  } else {
    body = (
      <>
        <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-hidden>
          <BarChart data={data} accessibilityLayer={false} margin={{ left: 4, right: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
            <YAxis tickFormatter={compactCurrency} tickLine={false} axisLine={false} width={72} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent formatter={moneyTooltipRow} labelFormatter={(_, payload) => payload?.[0]?.payload?.title} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="incomeCents" name="Receita" fill="var(--color-incomeCents)" radius={4} />
            <Bar dataKey="expenseCents" name="Despesa" fill="var(--color-expenseCents)" radius={4} />
          </BarChart>
        </ChartContainer>
        <ChartTable
          caption={`Receita e despesa por ${series.granularity === "day" ? "dia" : "mês"} de vencimento`}
          columns={["Período", "Receita", "Despesa"]}
          rows={data.map((point) => [point.title, formatCurrency(point.incomeCents), formatCurrency(point.expenseCents)])}
        />
      </>
    )
  }

  return (
    <SectionCard title="Receita × despesa" description={description}>
      {body}
    </SectionCard>
  )
}
