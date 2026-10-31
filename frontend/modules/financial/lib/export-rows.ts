import { ENTRY_STATUS_LABELS, KIND_LABELS } from "@/domain/financial"
import { clinicDateKey, inClinic } from "@/domain/clinic-time"
import type { FinancialListRow } from "@/shared/api/financial-report-mappers"

/**
 * Linhas e colunas da planilha de lançamentos (RN-FIN-015), montadas sem DOM nem `exceljs`. O servidor devolve
 * centavos; só aqui eles viram reais. Datas viram `Date` com os campos em UTC iguais à data civil (a planilha
 * guarda data sem fuso, então o dia nunca escorrega).
 */

export type ExportCell = string | number | Date | null

export type ColumnKind = "text" | "date" | "datetime" | "money"

export interface ExportColumn {
  key: "code" | "kind" | "description" | "category" | "counterparty" | "competence" | "dueDate" | "amount" | "paid" | "balance" | "status" | "patient" | "createdAt"
  header: string
  width: number
  kind: ColumnKind
}

export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  { key: "code", header: "Código", width: 14, kind: "text" },
  { key: "kind", header: "Tipo", width: 11, kind: "text" },
  { key: "description", header: "Descrição", width: 42, kind: "text" },
  { key: "category", header: "Categoria", width: 20, kind: "text" },
  { key: "counterparty", header: "Contraparte", width: 24, kind: "text" },
  { key: "competence", header: "Competência", width: 14, kind: "text" },
  { key: "dueDate", header: "Vencimento", width: 14, kind: "date" },
  { key: "amount", header: "Valor", width: 16, kind: "money" },
  { key: "paid", header: "Pago", width: 16, kind: "money" },
  { key: "balance", header: "Saldo", width: 16, kind: "money" },
  { key: "status", header: "Situação", width: 14, kind: "text" },
  { key: "patient", header: "Paciente", width: 28, kind: "text" },
  { key: "createdAt", header: "Criado em", width: 18, kind: "datetime" },
]

/** Formatos de célula do Excel (o separador decimal aparece conforme o idioma de quem abre o arquivo). */
export const NUMBER_FORMATS: Record<Exclude<ColumnKind, "text">, string> = {
  money: '"R$" #,##0.00',
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
}

/** Centavos inteiros → reais com 2 casas, sem deriva de ponto flutuante. */
export const centsToReais = (cents: number) => Math.round(cents) / 100

/** `2026-10-05` → data civil como `Date` UTC (meia-noite). Data inexistente ou texto fora do formato vira vazio. */
export function civilDate(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  // `Date.UTC` rola o mês em vez de recusar (30/02 vira 02/03): só vale a data que volta igual.
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null
}

/** Instante ISO → hora de parede da clínica, como `Date` UTC (a planilha mostra o horário de Brasília). */
export function clinicWallClock(iso: string): Date | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const local = inClinic(at)
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes()))
}

/** `2026-10` → `10/2026`. */
export const competenceText = (competence: string) => {
  const [year, month] = competence.split("-")
  return month && year ? `${month}/${year}` : competence
}

export interface TotalsByKind {
  amountCents: number
  paidCents: number
  balanceCents: number
}

export interface ExportSheet {
  columns: readonly ExportColumn[]
  /** Uma linha por lançamento, na ordem de `columns`. */
  rows: ExportCell[][]
  /** Totais por tipo, sem os cancelados (somar receita com despesa misturaria os sinais). */
  totals: { income: TotalsByKind; expense: TotalsByKind }
}

const emptyTotals = (): TotalsByKind => ({ amountCents: 0, paidCents: 0, balanceCents: 0 })

export function buildExportSheet(rows: readonly FinancialListRow[], patientNames: Readonly<Record<string, string>> = {}): ExportSheet {
  const totals = { income: emptyTotals(), expense: emptyTotals() }
  const cells = rows.map(({ entry, paidCents, balanceCents, status }) => {
    if (status !== "cancelled") {
      const bucket = totals[entry.kind]
      bucket.amountCents += entry.amountCents
      bucket.paidCents += paidCents
      bucket.balanceCents += balanceCents
    }
    const byKey: Record<ExportColumn["key"], ExportCell> = {
      code: entry.code,
      kind: KIND_LABELS[entry.kind],
      description: entry.description,
      category: entry.category,
      counterparty: entry.counterparty ?? "",
      competence: competenceText(entry.competence),
      dueDate: civilDate(entry.dueDate),
      amount: centsToReais(entry.amountCents),
      paid: centsToReais(paidCents),
      balance: centsToReais(balanceCents),
      status: ENTRY_STATUS_LABELS[status],
      patient: entry.patientId ? (patientNames[entry.patientId] ?? "—") : "",
      createdAt: clinicWallClock(entry.createdAt),
    }
    return EXPORT_COLUMNS.map((column) => byKey[column.key])
  })
  return { columns: EXPORT_COLUMNS, rows: cells, totals }
}

/** `financeiro-AAAA-MM-DD.xlsx`, com a data no fuso da clínica. */
export const exportFileName = (now: Date = new Date()) => `financeiro-${clinicDateKey(now)}.xlsx`
