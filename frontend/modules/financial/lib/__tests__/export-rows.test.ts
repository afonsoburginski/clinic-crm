import { describe, expect, it } from "vitest"

import type { FinancialEntry, FinancialEntryStatus } from "@/domain/types"
import type { FinancialListRow } from "@/shared/api/financial-report-mappers"

import { buildExportSheet, centsToReais, civilDate, clinicWallClock, competenceText, EXPORT_COLUMNS, exportFileName, NUMBER_FORMATS } from "../export-rows"

const entry = (over: Partial<FinancialEntry> = {}): FinancialEntry => ({
  id: "3f2a1bcd-0000",
  code: "LAN-3F2A1B",
  kind: "income",
  description: "Sessão de psicologia",
  category: "Consulta",
  competence: "2026-10",
  dueDate: "2026-10-20",
  amountCents: 19_999,
  createdBy: "u1",
  createdAt: "2026-10-01T12:30:00.000Z",
  updatedAt: "2026-10-01T12:30:00.000Z",
  ...over,
})
const row = (over: Omit<Partial<FinancialListRow>, "entry"> & { entry?: Partial<FinancialEntry> } = {}): FinancialListRow => {
  const { entry: entryOver, ...rest } = over
  return { entry: entry(entryOver), paidCents: 5_000, balanceCents: 14_999, status: "partial" as FinancialEntryStatus, methods: ["pix"], ...rest }
}

describe("FIN — valores da planilha", () => {
  it("centavos viram reais sem deriva de ponto flutuante", () => {
    expect(centsToReais(19_999)).toBe(199.99)
    expect(centsToReais(1_005)).toBe(10.05)
    expect(centsToReais(7)).toBe(0.07)
    expect(centsToReais(0)).toBe(0)
  })

  it("data civil não escorrega de dia e valor inválido vira vazio", () => {
    expect(civilDate("2026-10-05")?.toISOString()).toBe("2026-10-05T00:00:00.000Z")
    expect(civilDate("2026-02-30")).toBeNull()
    expect(civilDate("")).toBeNull()
    expect(civilDate("05/10/2026")).toBeNull()
  })

  it("instante vira hora de parede de Brasília (UTC−3), como `Date` UTC", () => {
    expect(clinicWallClock("2026-11-01T01:30:00Z")?.toISOString()).toBe("2026-10-31T22:30:00.000Z")
    expect(clinicWallClock("2026-10-01T12:30:00.000Z")?.toISOString()).toBe("2026-10-01T09:30:00.000Z")
    expect(clinicWallClock("")).toBeNull()
    expect(clinicWallClock("não é data")).toBeNull()
  })

  it("competência em pt-BR e nome do arquivo com a data da clínica", () => {
    expect(competenceText("2026-10")).toBe("10/2026")
    expect(exportFileName(new Date("2026-11-01T01:30:00Z"))).toBe("financeiro-2026-10-31.xlsx")
    expect(exportFileName(new Date("2026-11-01T03:00:00Z"))).toBe("financeiro-2026-11-01.xlsx")
  })
})

describe("FIN — linhas da planilha", () => {
  it("colunas na ordem pedida e formatos de número, data e moeda", () => {
    expect(EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      "Código", "Tipo", "Descrição", "Categoria", "Contraparte", "Competência", "Vencimento", "Valor", "Pago", "Saldo", "Situação", "Paciente", "Criado em",
    ])
    expect(NUMBER_FORMATS).toEqual({ money: '"R$" #,##0.00', date: "dd/mm/yyyy", datetime: "dd/mm/yyyy hh:mm" })
  })

  it("cada lançamento vira uma linha formatada: reais, data real, rótulos pt-BR e paciente", () => {
    const { rows } = buildExportSheet([row({ entry: { patientId: "p1", counterparty: "Clínica Sul" } })], { p1: "Ana Souza" })
    expect(rows).toEqual([
      [
        "LAN-3F2A1B", "Receita", "Sessão de psicologia", "Consulta", "Clínica Sul", "10/2026", new Date("2026-10-20T00:00:00.000Z"),
        199.99, 50, 149.99, "Parcial", "Ana Souza", new Date("2026-10-01T09:30:00.000Z"),
      ],
    ])
  })

  it("paciente: vazio sem vínculo, traço quando o perfil não lê pacientes", () => {
    const [linked] = buildExportSheet([row({ entry: { patientId: "p9" } })], {}).rows
    const [none] = buildExportSheet([row()], {}).rows
    expect(linked[11]).toBe("—")
    expect(none[11]).toBe("")
    expect(none[4]).toBe("")
  })

  it("totais por tipo somam em centavos e deixam de fora os cancelados", () => {
    const { totals } = buildExportSheet([
      row({ entry: { id: "a", amountCents: 10_000 }, paidCents: 10_000, balanceCents: 0, status: "paid" }),
      row({ entry: { id: "b", amountCents: 20_000 }, paidCents: 5_000, balanceCents: 15_000, status: "overdue" }),
      row({ entry: { id: "c", amountCents: 3_000 }, paidCents: 0, balanceCents: 3_000, status: "cancelled" }),
      row({ entry: { id: "d", kind: "expense", amountCents: 4_000 }, paidCents: 4_000, balanceCents: 0, status: "paid" }),
    ])
    expect(totals.income).toEqual({ amountCents: 30_000, paidCents: 15_000, balanceCents: 15_000 })
    expect(totals.expense).toEqual({ amountCents: 4_000, paidCents: 4_000, balanceCents: 0 })
  })

  it("sem lançamentos há colunas e nenhuma linha", () => {
    const sheet = buildExportSheet([])
    expect(sheet.rows).toEqual([])
    expect(sheet.columns).toHaveLength(13)
    expect(sheet.totals.income.amountCents).toBe(0)
  })
})
