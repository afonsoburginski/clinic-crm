import { ENTRY_STATUS_LABELS, METHOD_LABELS } from "@/domain/financial"
import type { FinancialEntryStatus, PaymentMethod } from "@/domain/types"
import type { FinancialReport } from "@/shared/api/financial-report-mappers"

/** Dados dos gráficos (valores em centavos; a formatação em reais é de quem desenha). Sem React, sem DOM. */

const compactBrl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 })

/** Eixo: `R$ 1,2 mil`, `R$ 3,5 mi`. */
export const compactCurrency = (cents: number) => compactBrl.format(cents / 100)

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

/** `2026-10` → `out/26`; `2026-10-05` → `05/10`. */
export function periodLabel(period: string, granularity: "day" | "month") {
  const [year, month, day] = period.split("-")
  if (granularity === "day") return `${day}/${month}`
  return `${MONTHS[Number(month) - 1] ?? month}/${year.slice(2)}`
}

/** Rótulo completo para o tooltip e a tabela alternativa: `outubro de 2026`, `05/10/2026`. */
export function periodTitle(period: string, granularity: "day" | "month") {
  const [year, month, day] = period.split("-")
  if (granularity === "day") return `${day}/${month}/${year}`
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
  return `${names[Number(month) - 1] ?? month} de ${year}`
}

export interface SeriesDatum {
  period: string
  label: string
  title: string
  incomeCents: number
  expenseCents: number
}

/** Receita × despesa por período (valor dos lançamentos não cancelados, pelo vencimento). */
export function seriesChartData(series: FinancialReport["series"]): SeriesDatum[] {
  return series.points.map((point) => ({
    period: point.period,
    label: periodLabel(point.period, series.granularity),
    title: periodTitle(point.period, series.granularity),
    incomeCents: point.incomeCents,
    expenseCents: point.expenseCents,
  }))
}

export const isSeriesEmpty = (series: FinancialReport["series"]) =>
  series.points.every((point) => point.incomeCents === 0 && point.expenseCents === 0)

/** Cor de cada situação: tokens do tema (azul, verde, amarelo) e os semânticos de erro e neutro. Nunca roxo. */
export const SITUATION_FILL: Record<FinancialEntryStatus, string> = {
  open: "var(--chart-2)",
  partial: "var(--chart-1)",
  paid: "var(--chart-4)",
  overdue: "var(--destructive)",
  cancelled: "var(--muted-foreground)",
}

export interface SituationDatum {
  key: FinancialEntryStatus
  label: string
  count: number
  amountCents: number
  fill: string
}

/** Só as situações que têm lançamento (as demais só poluiriam o gráfico). */
export function situationChartData(report: Pick<FinancialReport, "bySituation">): SituationDatum[] {
  return report.bySituation
    .filter((share) => share.count > 0)
    .map((share) => ({
      key: share.situation,
      label: ENTRY_STATUS_LABELS[share.situation],
      count: share.count,
      amountCents: share.amountCents,
      fill: SITUATION_FILL[share.situation],
    }))
}

export interface MethodDatum {
  key: PaymentMethod
  label: string
  count: number
  incomeCents: number
  expenseCents: number
}

/** Pagamentos ativos por forma, receita e despesa separadas (a API já ordena do maior para o menor). */
export function methodChartData(report: Pick<FinancialReport, "byMethod">): MethodDatum[] {
  return report.byMethod.map((share) => ({
    key: share.method,
    label: METHOD_LABELS[share.method],
    count: share.count,
    incomeCents: share.incomeCents,
    expenseCents: share.expenseCents,
  }))
}
