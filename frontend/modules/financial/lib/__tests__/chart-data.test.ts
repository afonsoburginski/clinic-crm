import { describe, expect, it } from "vitest"

import type { FinancialReport } from "@/shared/api/financial-report-mappers"

import { compactCurrency, isSeriesEmpty, methodChartData, periodLabel, periodTitle, seriesChartData, situationChartData, SITUATION_FILL } from "../chart-data"

const flat = (text: string) => text.replace(/\s/g, " ")

describe("FIN — dados dos gráficos", () => {
  it("rótulos de período: mês `out/26`, dia `05/10`, com título completo para o tooltip", () => {
    expect(periodLabel("2026-10", "month")).toBe("out/26")
    expect(periodLabel("2026-10-05", "day")).toBe("05/10")
    expect(periodTitle("2026-10", "month")).toBe("outubro de 2026")
    expect(periodTitle("2026-10-05", "day")).toBe("05/10/2026")
  })

  it("eixo compacto em reais", () => {
    expect(flat(compactCurrency(150_000))).toBe("R$ 1,5 mil")
    expect(flat(compactCurrency(0))).toBe("R$ 0")
    expect(flat(compactCurrency(250_000_000))).toBe("R$ 2,5 mi")
  })

  it("série mantém os centavos da API e identifica o período vazio", () => {
    const series: FinancialReport["series"] = {
      granularity: "month",
      points: [
        { period: "2026-10", incomeCents: 24_000, expenseCents: 4_000, incomeSettledCents: 11_000, expenseSettledCents: 4_000 },
        { period: "2026-11", incomeCents: 0, expenseCents: 0, incomeSettledCents: 0, expenseSettledCents: 0 },
      ],
    }
    expect(seriesChartData(series)).toEqual([
      { period: "2026-10", label: "out/26", title: "outubro de 2026", incomeCents: 24_000, expenseCents: 4_000 },
      { period: "2026-11", label: "nov/26", title: "novembro de 2026", incomeCents: 0, expenseCents: 0 },
    ])
    expect(isSeriesEmpty(series)).toBe(false)
    expect(isSeriesEmpty({ granularity: "day", points: [series.points[1]] })).toBe(true)
    expect(isSeriesEmpty({ granularity: "day", points: [] })).toBe(true)
  })

  it("distribuição por situação só traz as situações com lançamento, com rótulo pt-BR e cor do tema", () => {
    const data = situationChartData({
      bySituation: [
        { situation: "open", count: 1, amountCents: 2_000 },
        { situation: "partial", count: 0, amountCents: 0 },
        { situation: "overdue", count: 2, amountCents: 14_000 },
      ],
    })
    expect(data).toEqual([
      { key: "open", label: "Em aberto", count: 1, amountCents: 2_000, fill: SITUATION_FILL.open },
      { key: "overdue", label: "Vencido", count: 2, amountCents: 14_000, fill: SITUATION_FILL.overdue },
    ])
  })

  it("nenhuma cor de situação é roxa e todas vêm de tokens do tema", () => {
    for (const fill of Object.values(SITUATION_FILL)) expect(fill).toMatch(/^var\(--(chart-[1-4]|destructive|muted-foreground)\)$/)
  })

  it("distribuição por forma de pagamento mantém receita e despesa separadas", () => {
    expect(
      methodChartData({
        byMethod: [
          { method: "pix", count: 3, incomeCents: 10_000, expenseCents: 0 },
          { method: "transfer", count: 1, incomeCents: 0, expenseCents: 4_000 },
        ],
      })
    ).toEqual([
      { key: "pix", label: "Pix", count: 3, incomeCents: 10_000, expenseCents: 0 },
      { key: "transfer", label: "Transferência", count: 1, incomeCents: 0, expenseCents: 4_000 },
    ])
  })
})
