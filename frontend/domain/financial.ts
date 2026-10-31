import { ValidationError } from "./errors"
import type { FinancialEntry, FinancialEntryStatus, FinancialKind, FinancialPayment, PaymentMethod } from "./types"

export const ENTRY_STATUS_LABELS: Record<FinancialEntryStatus, string> = {
  open: "Em aberto",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
}

export const KIND_LABELS: Record<FinancialKind, string> = { income: "Receita", expense: "Despesa" }

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  card: "Cartão",
  transfer: "Transferência",
  boleto: "Boleto",
  other: "Outro",
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

const MIN_AMOUNT_MESSAGE = "O valor deve ser maior que zero (mínimo R$ 0,01)."

/** RN-FIN-001: valor em centavos inteiro e de ao menos 1. */
export function validateEntryAmount(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents < 1) throw new ValidationError(MIN_AMOUNT_MESSAGE)
}

/** RN-FIN-001: no máximo 2 casas decimais — nada é arredondado em silêncio. */
export function hasCentPrecision(amount: number) {
  const scaled = amount * 100
  return Number.isFinite(scaled) && Math.abs(scaled - Math.round(scaled)) <= 1e-6
}

/** Converte reais em centavos, recusando valor que arredonde a zero ou tenha mais de 2 casas decimais. */
export function amountToCents(amount: number) {
  if (!Number.isFinite(amount)) throw new ValidationError(MIN_AMOUNT_MESSAGE)
  const cents = Math.round(amount * 100)
  validateEntryAmount(cents)
  if (!hasCentPrecision(amount)) throw new ValidationError("O valor deve ter no máximo 2 casas decimais.")
  return cents
}

/** Pagamentos que contam no saldo: os estornados ficam preservados, mas fora da conta (RN-FIN-007). */
export function activePayments(payments: FinancialPayment[]) {
  return payments.filter((p) => !p.reversedAt)
}

export function paidCents(payments: FinancialPayment[]) {
  return activePayments(payments).reduce((sum, p) => sum + p.amountCents, 0)
}

export function balanceCents(entry: Pick<FinancialEntry, "amountCents">, payments: FinancialPayment[]) {
  return Math.max(0, entry.amountCents - paidCents(payments))
}

/** RN-FIN-002. `today` é a data civil da clínica (AAAA-MM-DD). */
export function entryStatus(entry: FinancialEntry, payments: FinancialPayment[], today: string): FinancialEntryStatus {
  if (entry.cancelledAt) return "cancelled"
  const paid = paidCents(payments)
  if (paid >= entry.amountCents) return "paid"
  if (entry.dueDate < today) return "overdue"
  return paid > 0 ? "partial" : "open"
}

/** RN-FIN-003/004/005 */
export function validatePayment(
  entry: FinancialEntry,
  payments: FinancialPayment[],
  input: { amountCents: number; paidAt: string },
  today: string
) {
  if (entry.cancelledAt) throw new ValidationError("Lançamento cancelado não recebe pagamentos.")
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new ValidationError("O valor deve ser maior que zero.")
  if (input.paidAt > today) throw new ValidationError("A data do pagamento não pode ser futura.")
  const open = balanceCents(entry, payments)
  if (open <= 0) throw new ValidationError("Este lançamento já está quitado — não é possível dar baixa novamente.")
  if (input.amountCents > open) {
    throw new ValidationError(`O valor excede o saldo em aberto (${brl.format(open / 100)}). Pagamentos parciais são permitidos até o saldo.`)
  }
}

/** RN-FIN-006 */
export function validateCancellation(entry: FinancialEntry, payments: FinancialPayment[], reason: string) {
  if (entry.cancelledAt) throw new ValidationError("Lançamento já cancelado.")
  if (activePayments(payments).length) throw new ValidationError("Estorne os pagamentos antes de cancelar o lançamento.")
  if (reason.trim().length < 5) throw new ValidationError("Informe o motivo do cancelamento (mínimo 5 caracteres).")
}

/** RN-FIN-007 */
export function validateReversal(entry: FinancialEntry, payment: FinancialPayment, reason: string) {
  if (payment.reversedAt) throw new ValidationError("Este pagamento já foi estornado.")
  if (entry.cancelledAt) throw new ValidationError("Lançamento cancelado não admite estorno.")
  if (reason.trim().length < 5) throw new ValidationError("Informe o motivo do estorno (mínimo 5 caracteres).")
}

/** RN-FIN-008 */
export function validateEntryUpdate(
  entry: FinancialEntry,
  payments: FinancialPayment[],
  next: { kind: FinancialKind; amountCents: number }
) {
  if (entry.cancelledAt) throw new ValidationError("Lançamento cancelado não pode ser alterado.")
  validateEntryAmount(next.amountCents)
  if (next.kind !== entry.kind) throw new ValidationError("O tipo do lançamento (receita ou despesa) não pode mudar.")
  if (next.amountCents < paidCents(payments)) throw new ValidationError("O valor não pode ficar abaixo do total já pago.")
}

export interface KindSummary {
  count: number
  expectedCents: number
  settledCents: number
  openCents: number
  overdueCents: number
}

export interface CompetenceSummary {
  competence: string
  income: KindSummary
  expense: KindSummary
  /** Receita recebida menos despesa paga, só do que foi efetivamente baixado. */
  realizedResultCents: number
}

/** RF-FIN-003: tudo calculado dos lançamentos e pagamentos reais; sem lançamentos, tudo zero. */
export function summarize(
  entries: FinancialEntry[],
  payments: FinancialPayment[],
  competence: string,
  today: string
): CompetenceSummary {
  const empty = (): KindSummary => ({ count: 0, expectedCents: 0, settledCents: 0, openCents: 0, overdueCents: 0 })
  const out = { income: empty(), expense: empty() }
  for (const entry of entries) {
    if (entry.competence !== competence || entry.cancelledAt) continue
    const own = payments.filter((p) => p.entryId === entry.id)
    const bucket = out[entry.kind]
    const settled = Math.min(paidCents(own), entry.amountCents)
    bucket.count += 1
    bucket.expectedCents += entry.amountCents
    bucket.settledCents += settled
    bucket.openCents += entry.amountCents - settled
    if (entryStatus(entry, own, today) === "overdue") bucket.overdueCents += entry.amountCents - settled
  }
  return { competence, ...out, realizedResultCents: out.income.settledCents - out.expense.settledCents }
}
