import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"

import type { FinancialEntry, FinancialEntryStatus } from "@/domain/types"
import type { FinancialListRow, FinancialReport } from "@/shared/api/financial-report-mappers"

import { buildWorkbook, createFinancialXlsx, workbookToBlob } from "../export-xlsx"

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
const row = (over: { entry?: Partial<FinancialEntry>; paidCents?: number; balanceCents?: number; status?: FinancialEntryStatus } = {}): FinancialListRow => ({
  entry: entry(over.entry),
  paidCents: over.paidCents ?? 5_000,
  balanceCents: over.balanceCents ?? 14_999,
  status: over.status ?? "partial",
  methods: ["pix"],
})

const rows: FinancialListRow[] = [
  row({ entry: { id: "a", code: "LAN-AAAAAA", patientId: "p1", amountCents: 10_000 }, paidCents: 10_000, balanceCents: 0, status: "paid" }),
  row({ entry: { id: "b", code: "LAN-BBBBBB", amountCents: 19_999, dueDate: "2026-10-05" }, paidCents: 5_000, balanceCents: 14_999, status: "overdue" }),
  row({ entry: { id: "c", code: "LAN-CCCCCC", amountCents: 3_000 }, paidCents: 0, balanceCents: 3_000, status: "cancelled" }),
  row({ entry: { id: "d", code: "LAN-DDDDDD", kind: "expense", amountCents: 4_050, category: "Aluguel", counterparty: "Imobiliária Sul" }, paidCents: 4_050, balanceCents: 0, status: "paid" }),
]
const report: Pick<FinancialReport, "indicators"> = {
  indicators: { receivedCents: 15_000, receivableCents: 0, overdueCents: 14_999, expensesCents: 4_050, resultCents: 10_950, averageTicketCents: 7_500, entryCount: 4 },
}
const generatedAt = new Date("2026-11-01T01:30:00Z") // 31/10/2026 22:30 em Brasília

/** Gera o arquivo e lê de volta, como o Excel faria. */
async function roundTrip(input: Partial<Parameters<typeof buildWorkbook>[0]> = {}) {
  const { blob, fileName } = await createFinancialXlsx({
    rows, patientNames: { p1: "Ana Souza" }, filters: { from: "2026-10-01", to: "2026-10-31", statuses: ["overdue"] }, report, generatedAt, ...input,
  })
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(await blob.arrayBuffer())
  return { book, fileName, blob }
}

describe("FIN — planilha XLSX", () => {
  it("nome do arquivo com a data da clínica e tipo MIME de planilha", async () => {
    const { fileName, blob } = await roundTrip()
    expect(fileName).toBe("financeiro-2026-10-31.xlsx")
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  })

  it("tem as abas Lançamentos e Resumo", async () => {
    const { book } = await roundTrip()
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Lançamentos", "Resumo"])
  })

  it("cabeçalho em negrito, congelado, com filtro automático e largura de coluna", async () => {
    const sheet = (await roundTrip()).book.getWorksheet("Lançamentos")!
    expect((sheet.getRow(1).values as string[]).slice(1)).toEqual([
      "Código", "Tipo", "Descrição", "Categoria", "Contraparte", "Competência", "Vencimento", "Valor", "Pago", "Saldo", "Situação", "Paciente", "Criado em",
    ])
    expect(sheet.getRow(1).font?.bold).toBe(true)
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 })
    expect(sheet.autoFilter).toBe("A1:M5") // cabeçalho e as 4 linhas; os totais ficam fora do filtro
    expect(sheet.getColumn(3).width).toBeGreaterThan(30)
  })

  it("Valor, Pago e Saldo são números com formato de moeda; Vencimento e Criado em são datas de verdade", async () => {
    const sheet = (await roundTrip()).book.getWorksheet("Lançamentos")!
    const second = sheet.getRow(3) // lançamento "b"
    expect(second.getCell(8).value).toBe(199.99)
    expect(second.getCell(9).value).toBe(50)
    expect(second.getCell(10).value).toBe(149.99)
    for (const column of [8, 9, 10]) expect(second.getCell(column).numFmt).toBe('"R$" #,##0.00')

    const due = second.getCell(7)
    expect(due.value).toBeInstanceOf(Date)
    expect((due.value as Date).toISOString().slice(0, 10)).toBe("2026-10-05")
    expect(due.numFmt).toBe("dd/mm/yyyy")

    const created = sheet.getRow(2).getCell(13)
    expect(created.value).toBeInstanceOf(Date)
    expect((created.value as Date).toISOString()).toBe("2026-10-01T09:30:00.000Z") // hora de parede de Brasília
    expect(created.numFmt).toBe("dd/mm/yyyy hh:mm")
  })

  it("textos em pt-BR: tipo, situação, competência, contraparte e paciente", async () => {
    const sheet = (await roundTrip()).book.getWorksheet("Lançamentos")!
    const text = (rowNumber: number) => [2, 3, 4, 5, 6, 11, 12].map((column) => sheet.getRow(rowNumber).getCell(column).value)
    expect(text(2)).toEqual(["Receita", "Sessão de psicologia", "Consulta", "", "10/2026", "Pago", "Ana Souza"])
    expect(text(5)).toEqual(["Despesa", "Sessão de psicologia", "Aluguel", "Imobiliária Sul", "10/2026", "Pago", ""])
    expect(sheet.getRow(4).getCell(11).value).toBe("Cancelado")
  })

  it("totais por tipo com fórmulas SUMIFS, sem cancelados, e o resultado", async () => {
    const sheet = (await roundTrip()).book.getWorksheet("Lançamentos")!
    // dados nas linhas 2–5; linha 6 em branco; totais a partir da 7
    expect(sheet.getRow(7).getCell(1).value).toBe("Total de receitas")
    expect(sheet.getRow(8).getCell(1).value).toBe("Total de despesas")
    expect(sheet.getRow(9).getCell(1).value).toBe("Resultado (receitas − despesas)")

    const income = sheet.getRow(7).getCell(8).value as { formula: string; result: number }
    expect(income.formula).toBe('SUMIFS($H$2:$H$5,$B$2:$B$5,"Receita",$K$2:$K$5,"<>Cancelado")')
    expect(income.result).toBe(299.99) // 100,00 + 199,99; o cancelado de 30,00 fica de fora
    expect((sheet.getRow(7).getCell(9).value as { result: number }).result).toBe(150) // pago: 100,00 + 50,00
    expect((sheet.getRow(7).getCell(10).value as { result: number }).result).toBe(149.99)

    const expense = sheet.getRow(8).getCell(8).value as { formula: string; result: number }
    expect(expense.formula).toContain('"Despesa"')
    expect(expense.result).toBe(40.5)

    const result = sheet.getRow(9).getCell(8).value as { formula: string; result: number }
    expect(result.formula).toBe("H7-H8")
    expect(result.result).toBe(259.49)
    expect(sheet.getRow(7).getCell(8).numFmt).toBe('"R$" #,##0.00')
    expect(sheet.getRow(7).font?.bold).toBe(true)
  })

  it("aba Resumo: filtros aplicados em texto e indicadores numéricos", async () => {
    const sheet = (await roundTrip()).book.getWorksheet("Resumo")!
    const column = (index: number) => sheet.getColumn(index).values.slice(1)
    expect(column(1)).toEqual(expect.arrayContaining(["Financeiro — resumo", "Filtros aplicados", "Vencimento: 01/10/2026 a 31/10/2026", "Situação: Vencido", "Indicadores", "Receita recebida", "Ticket médio"]))
    const generated = sheet.getCell("B2")
    expect((generated.value as Date).toISOString()).toBe("2026-10-31T22:30:00.000Z")
    const figures = Object.fromEntries(sheet.getColumn(1).values.flatMap((label, index) => (typeof label === "string" && sheet.getCell(index, 2).value !== null ? [[label, sheet.getCell(index, 2).value]] : [])))
    expect(figures).toMatchObject({
      "Receita recebida": 150,
      "A receber": 0,
      Vencido: 149.99,
      "Despesas pagas": 40.5,
      "Resultado realizado": 109.5,
      "Ticket médio": 75,
      "Lançamentos no filtro": 4,
    })
    expect(sheet.getCell(`B${(sheet.getColumn(1).values as string[]).indexOf("Receita recebida")}`).numFmt).toBe('"R$" #,##0.00')
  })

  it("sem filtro o resumo diz que são todos os lançamentos; sem linhas só há cabeçalho e nenhum total", async () => {
    const { book } = await roundTrip({ rows: [], filters: {} })
    expect(book.getWorksheet("Resumo")!.getColumn(1).values).toContain("Nenhum filtro: todos os lançamentos.")
    const sheet = book.getWorksheet("Lançamentos")!
    expect(sheet.rowCount).toBe(1)
    expect(sheet.getRow(1).getCell(1).value).toBe("Código")
  })

  it("o Blob gerado é um arquivo XLSX (zip) legível", async () => {
    const blob = await workbookToBlob(await buildWorkbook({ rows, filters: {}, report, generatedAt }))
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 2)
    expect(String.fromCharCode(...head)).toBe("PK")
  })
})
