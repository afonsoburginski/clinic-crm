export type Payment = {
  amountCents: number
  reversedAt?: string | null
}

export type FinancialEntry = {
  amountCents: number
  dueDate: string
  cancelledAt?: string | null
  payments: Payment[]
}

export function activePaidCents(payments: Payment[]): number {
  return payments
    .filter((payment) => !payment.reversedAt)
    .reduce((total, payment) => total + payment.amountCents, 0)
}

export function financialStatus(
  entry: FinancialEntry,
  today: string,
): "cancelled" | "paid" | "overdue" | "partial" | "open" {
  if (entry.cancelledAt) return "cancelled"
  const paid = activePaidCents(entry.payments)
  if (paid >= entry.amountCents) return "paid"
  if (entry.dueDate < today) return "overdue"
  if (paid > 0) return "partial"
  return "open"
}

export function validatePayment(
  entry: FinancialEntry,
  amountCents: number,
  paidAt: string,
  today: string,
): void {
  if (
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    entry.cancelledAt ||
    financialStatus(entry, today) === "paid" ||
    amountCents > entry.amountCents - activePaidCents(entry.payments) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(paidAt) ||
    paidAt > today
  ) {
    throw new Error("validation")
  }
}

export function validateCancellation(entry: FinancialEntry, reason: string): void {
  if (reason.trim().length < 5) throw new Error("validation")
  if (entry.payments.some((payment) => !payment.reversedAt)) {
    throw new Error("conflict")
  }
}

export function validateReversal(payment: Payment, reason: string): void {
  if (reason.trim().length < 5) throw new Error("validation")
  if (payment.reversedAt) throw new Error("conflict")
}
