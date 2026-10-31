import type { Workbook } from "exceljs"

import { ENTRY_STATUS_LABELS, KIND_LABELS } from "@/domain/financial"
import type { FinancialListRow, FinancialQueryFilters, FinancialReport } from "@/shared/api/financial-report-mappers"

import { buildExportSheet, centsToReais, clinicWallClock, exportFileName, NUMBER_FORMATS, type ExportColumn } from "./export-rows"
import { describeFilters } from "./filters"

/**
 * Escrita do workbook (RN-FIN-015). O `exceljs` é grande: só entra no bundle quando o usuário clica em exportar
 * (import dinâmico). As linhas e colunas vêm de `export-rows.ts`; aqui só há formatação e fórmulas.
 */

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const HEADER_FILL = "FFE8EEF7"

export interface WorkbookInput {
  rows: readonly FinancialListRow[]
  patientNames?: Readonly<Record<string, string>>
  /** Filtros da tela, para a aba "Resumo". */
  filters: FinancialQueryFilters
  /** Indicadores do mesmo filtro, para a aba "Resumo". */
  report: Pick<FinancialReport, "indicators">
  generatedAt: Date
}

async function loadExcel(): Promise<typeof import("exceljs")> {
  const mod = await import("exceljs")
  return ("default" in mod && mod.default ? mod.default : mod) as typeof import("exceljs")
}

const formatOf = (column: ExportColumn) => (column.kind === "text" ? undefined : NUMBER_FORMATS[column.kind])

export async function buildWorkbook(input: WorkbookInput): Promise<Workbook> {
  const { Workbook: Book } = await loadExcel()
  const workbook = new Book()
  workbook.creator = "Villiére"
  workbook.created = input.generatedAt

  addEntriesSheet(workbook, input)
  addSummarySheet(workbook, input)
  return workbook
}

function addEntriesSheet(workbook: Workbook, { rows, patientNames }: WorkbookInput) {
  const { columns, rows: cells, totals } = buildExportSheet(rows, patientNames)
  const sheet = workbook.addWorksheet("Lançamentos", { views: [{ state: "frozen", ySplit: 1 }] })
  sheet.columns = columns.map((column) => ({ header: column.header, key: column.key, width: column.width }))

  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: "middle" }
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
  })

  for (const row of cells) {
    const added = sheet.addRow(row)
    columns.forEach((column, index) => {
      const format = formatOf(column)
      if (format) added.getCell(index + 1).numFmt = format
    })
  }

  const last = cells.length + 1
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: columns.length } }
  if (!cells.length) return

  // Totais por tipo, sem os cancelados: somar receita com despesa misturaria os sinais.
  const at = (key: ExportColumn["key"]) => columns.findIndex((column) => column.key === key) + 1
  const letter = (key: ExportColumn["key"]) => sheet.getColumn(at(key)).letter
  const kindRange = `$${letter("kind")}$2:$${letter("kind")}$${last}`
  const statusRange = `$${letter("status")}$2:$${letter("status")}$${last}`
  const money = ["amount", "paid", "balance"] as const
  const cents = { amount: "amountCents", paid: "paidCents", balance: "balanceCents" } as const

  const first = last + 2
  const incomeRow = first
  const expenseRow = first + 1
  const resultRow = first + 2
  const put = (rowNumber: number, label: string) => {
    const row = sheet.getRow(rowNumber)
    row.getCell(1).value = label
    row.font = { bold: true }
    return row
  }

  for (const [rowNumber, label, kind] of [
    [incomeRow, "Total de receitas", "income"],
    [expenseRow, "Total de despesas", "expense"],
  ] as const) {
    const row = put(rowNumber, label)
    for (const key of money) {
      const range = `$${letter(key)}$2:$${letter(key)}$${last}`
      const cell = row.getCell(at(key))
      cell.value = {
        formula: `SUMIFS(${range},${kindRange},"${KIND_LABELS[kind]}",${statusRange},"<>${ENTRY_STATUS_LABELS.cancelled}")`,
        result: centsToReais(totals[kind][cents[key]]),
      }
      cell.numFmt = NUMBER_FORMATS.money
    }
  }
  const result = put(resultRow, "Resultado (receitas − despesas)")
  for (const key of money) {
    const cell = result.getCell(at(key))
    cell.value = {
      formula: `${letter(key)}${incomeRow}-${letter(key)}${expenseRow}`,
      result: centsToReais(totals.income[cents[key]] - totals.expense[cents[key]]),
    }
    cell.numFmt = NUMBER_FORMATS.money
  }
}

function addSummarySheet(workbook: Workbook, { filters, report, generatedAt }: WorkbookInput) {
  const sheet = workbook.addWorksheet("Resumo")
  sheet.columns = [{ width: 34 }, { width: 22 }]

  sheet.getCell("A1").value = "Financeiro — resumo"
  sheet.getCell("A1").font = { bold: true, size: 14 }
  sheet.getCell("A2").value = "Gerado em"
  const generated = sheet.getCell("B2")
  generated.value = clinicWallClock(generatedAt.toISOString())
  generated.numFmt = NUMBER_FORMATS.datetime
  generated.alignment = { horizontal: "left" }

  let row = 4
  sheet.getCell(`A${row}`).value = "Filtros aplicados"
  sheet.getCell(`A${row}`).font = { bold: true }
  const lines = describeFilters(filters)
  for (const line of lines.length ? lines : ["Nenhum filtro: todos os lançamentos."]) {
    row += 1
    sheet.getCell(`A${row}`).value = line
  }

  row += 2
  sheet.getCell(`A${row}`).value = "Indicadores"
  sheet.getCell(`A${row}`).font = { bold: true }
  const { indicators } = report
  const figures: [string, number, string][] = [
    ["Receita recebida", centsToReais(indicators.receivedCents), NUMBER_FORMATS.money],
    ["A receber", centsToReais(indicators.receivableCents), NUMBER_FORMATS.money],
    ["Vencido", centsToReais(indicators.overdueCents), NUMBER_FORMATS.money],
    ["Despesas pagas", centsToReais(indicators.expensesCents), NUMBER_FORMATS.money],
    ["Resultado realizado", centsToReais(indicators.resultCents), NUMBER_FORMATS.money],
    ["Ticket médio", centsToReais(indicators.averageTicketCents), NUMBER_FORMATS.money],
    ["Lançamentos no filtro", indicators.entryCount, "0"],
  ]
  for (const [label, value, format] of figures) {
    row += 1
    sheet.getCell(`A${row}`).value = label
    const cell = sheet.getCell(`B${row}`)
    cell.value = value
    cell.numFmt = format
  }
}

export async function workbookToBlob(workbook: Workbook): Promise<Blob> {
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
}

/** Monta a planilha e devolve o arquivo com o nome `financeiro-AAAA-MM-DD.xlsx`. */
export async function createFinancialXlsx(input: WorkbookInput): Promise<{ blob: Blob; fileName: string }> {
  return { blob: await workbookToBlob(await buildWorkbook(input)), fileName: exportFileName(input.generatedAt) }
}

/** Dispara o download pelo navegador (Blob + `<a download>`). */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
