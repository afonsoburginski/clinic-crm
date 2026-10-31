import type { FinancialEntry, FinancialPayment, PaymentMethod } from "@/domain/types"
import { PAYMENT_METHODS } from "@/domain/schemas"

import { count, listOf, optional, text, type Row } from "./backend-mappers"
import { actorNameOf } from "./helpers"

/**
 * Lançamento da API (`api_resources`) → `FinancialEntry` + pagamentos. A API chama o tipo de `type`
 * (a UI, `kind`), não tem código sequencial e guarda os pagamentos dentro do lançamento.
 */
type NameOf = (actorId: string | undefined) => string

/** Sem código vindo da API, o código de exibição sai do id (`LAN-3F2A1B`). */
export const entryCodeOf = (id: string) => `LAN-${id.slice(0, 6).toUpperCase()}`

export function toFinancialEntry(raw: Row): FinancialEntry {
  const id = text(raw.id)
  const createdAt = text(raw.createdAt)
  return {
    id,
    code: optional(raw.code) ?? entryCodeOf(id),
    kind: (raw.kind ?? raw.type) === "expense" ? "expense" : "income",
    description: text(raw.description),
    category: text(raw.category),
    counterparty: optional(raw.counterparty),
    patientId: optional(raw.patientId),
    competence: text(raw.competence),
    dueDate: text(raw.dueDate),
    amountCents: count(raw.amountCents),
    cancelledAt: optional(raw.cancelledAt),
    cancelledBy: optional(raw.cancelledBy),
    cancelReason: optional(raw.cancelReason),
    createdBy: text(raw.createdBy),
    createdAt,
    updatedAt: text(raw.updatedAt) || createdAt,
  }
}

export function toFinancialPayment(raw: Row, entryId: string, nameOf: NameOf = actorNameOf): FinancialPayment {
  const paidAt = text(raw.paidAt)
  const method = PAYMENT_METHODS.find((m) => m === raw.method) ?? "other"
  return {
    id: text(raw.id),
    entryId,
    amountCents: count(raw.amountCents),
    paidAt,
    method: method as PaymentMethod,
    requestId: text(raw.requestId),
    registeredBy: text(raw.createdBy),
    registeredByName: nameOf(optional(raw.createdBy)),
    // A API não grava o instante do registro: a data da baixa ordena os pagamentos.
    createdAt: optional(raw.createdAt) ?? paidAt,
    reversedAt: optional(raw.reversedAt),
    reversedBy: optional(raw.reversedBy),
    reverseReason: optional(raw.reverseReason),
  }
}

export function toFinancialPayments(raw: Row, nameOf?: NameOf): FinancialPayment[] {
  const entryId = text(raw.id)
  return listOf(raw.payments).map((payment) => toFinancialPayment(payment, entryId, nameOf))
}
