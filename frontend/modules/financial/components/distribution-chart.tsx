"use client"

import { useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { Skeleton } from "@/components/ui/skeleton"
import type { FinancialReport } from "@/shared/api/api"
import { formatCurrency } from "@/shared/lib/format"
import { EmptyState, ErrorState } from "@/shared/ui/molecules/feedback-states"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { compactCurrency, methodChartData, situationChartData } from "../lib/chart-data"
import { ChartTable, moneyTooltipRow } from "./chart-shared"

type View = "status" | "method"

const methodConfig = {
  incomeCents: { label: "Receitas", color: "var(--chart-1)" },
  expenseCents: { label: "Despesas", color: "var(--chart-3)" },
} satisfies ChartConfig
const situationConfig = { amountCents: { label: "Valor" } } satisfies ChartConfig

/** RF-FIN-006 (2): distribuição por situação, com alternância para forma de pagamento. */
export function DistributionChart({
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
  const [view, setView] = useState<View>("status")
  const situations = report ? situationChartData(report) : []
  const methods = report ? methodChartData(report) : []
  const empty = view === "status" ? situations.length === 0 : methods.length === 0

  let body: React.ReactNode
  if (error && !report) body = <ErrorState error={error} onRetry={onRetry} className="py-10" />
  else if (isLoading || !report) body = <Skeleton className="h-64 w-full" aria-busy />
  else if (empty) {
    body = (
      <EmptyState
        title={view === "status" ? "Sem lançamentos no filtro" : "Sem pagamentos no filtro"}
        description={view === "status" ? "Ajuste o período ou os filtros para ver a distribuição." : "Nenhum pagamento ativo nos lançamentos filtrados."}
        className="py-10"
      />
    )
  } else if (view === "status") {
    body = (
      <>
        <ChartContainer config={situationConfig} className="aspect-auto h-64 w-full" aria-hidden>
          <BarChart data={situations} layout="vertical" accessibilityLayer={false} margin={{ left: 4, right: 12 }}>
            <CartesianGrid horizontal={false} />
            <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={84} />
            <XAxis type="number" tickFormatter={compactCurrency} tickLine={false} axisLine={false} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name, item) => (
                    <>
                      {moneyTooltipRow(value, item.payload?.label ?? name, item)}
                      <span className="basis-full pl-[18px] text-muted-foreground">
                        {item.payload?.count === 1 ? "1 lançamento" : `${item.payload?.count} lançamentos`}
                      </span>
                    </>
                  )}
                />
              }
            />
            <Bar dataKey="amountCents" name="Valor" radius={4} />
          </BarChart>
        </ChartContainer>
        <ChartTable
          caption="Valor e quantidade de lançamentos por situação"
          columns={["Situação", "Lançamentos", "Valor"]}
          rows={situations.map((row) => [row.label, row.count, formatCurrency(row.amountCents)])}
        />
      </>
    )
  } else {
    body = (
      <>
        <ChartContainer config={methodConfig} className="aspect-auto h-64 w-full" aria-hidden>
          <BarChart data={methods} layout="vertical" accessibilityLayer={false} margin={{ left: 4, right: 12 }}>
            <CartesianGrid horizontal={false} />
            <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={96} />
            <XAxis type="number" tickFormatter={compactCurrency} tickLine={false} axisLine={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={moneyTooltipRow} />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="incomeCents" name="Receitas" stackId="method" fill="var(--color-incomeCents)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="expenseCents" name="Despesas" stackId="method" fill="var(--color-expenseCents)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
        <ChartTable
          caption="Pagamentos ativos por forma de pagamento"
          columns={["Forma de pagamento", "Pagamentos", "Receitas", "Despesas"]}
          rows={methods.map((row) => [row.label, row.count, formatCurrency(row.incomeCents), formatCurrency(row.expenseCents)])}
        />
      </>
    )
  }

  return (
    <SectionCard
      title={view === "status" ? "Distribuição por situação" : "Pagamentos por forma"}
      description={view === "status" ? "Valor dos lançamentos filtrados em cada situação" : "Pagamentos ativos (não estornados) dos lançamentos filtrados"}
      actions={
        <HaloToggleGroup
          items={[
            { value: "status", label: "Situação" },
            { value: "method", label: "Forma de pagamento" },
          ]}
          value={view}
          onValueChange={(next) => next && setView(next as View)}
        />
      }
    >
      {body}
    </SectionCard>
  )
}
