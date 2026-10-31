import { clinicDateKey } from "@/domain/clinic-time"
import { NotFoundError, ValidationError } from "@/domain/errors"
import {
  amountToCents,
  balanceCents,
  entryStatus,
  paidCents,
  summarize,
  validateCancellation,
  validateEntryUpdate,
  validatePayment,
  validateReversal,
} from "@/domain/financial"
import {
  financialEntrySchema,
  paymentSchema,
  reasonSchema,
  type FinancialEntryInput,
  type PaymentInput,
  type ReasonInput,
} from "@/domain/schemas"
import type { FinancialEntry, FinancialEntryStatus, FinancialKind, FinancialPayment } from "@/domain/types"
import { commit, getDB, simulateLatency, uid } from "@/shared/lib/demo-db"

import { actor, audit, now, parse, requirePermission } from "./demo-context"

// RN-FIN-009: este adaptador lê apenas coleções financeiras e a referência opcional a paciente.
// Auditoria registra o fato, sem valores (RN-FIN-010).

export interface FinancialFilters {
  competence?: string
  kind?: FinancialKind | "all"
  status?: FinancialEntryStatus | "all"
  search?: string
}

const today = () => clinicDateKey(new Date())

function derived(entry: FinancialEntry) {
  const own = getDB().financialPayments.filter((p) => p.entryId === entry.id)
  return {
    entry,
    paidCents: paidCents(own),
    balanceCents: balanceCents(entry, own),
    status: entryStatus(entry, own, today()),
  }
}

function findEntry(id: string): FinancialEntry {
  const entry = getDB().financialEntries.find((e) => e.id === id)
  if (!entry) throw new NotFoundError("Lançamento não encontrado.")
  return entry
}

function putEntry(next: FinancialEntry) {
  const db = getDB()
  db.financialEntries[db.financialEntries.findIndex((e) => e.id === next.id)] = next
}

function fields(data: FinancialEntryInput) {
  if (data.patientId && !getDB().patients.some((p) => p.id === data.patientId)) {
    throw new ValidationError("Paciente não encontrado.")
  }
  return {
    kind: data.kind,
    description: data.description,
    category: data.category,
    counterparty: data.counterparty || undefined,
    patientId: data.patientId || undefined,
    competence: data.competence,
    dueDate: data.dueDate,
    amountCents: amountToCents(data.amount),
  }
}

/** RN-FIN-011: campos alterados, sem valores (nem o valor monetário nem o texto livre). */
function changedFields(before: FinancialEntry, after: FinancialEntry) {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of ["description", "category", "counterparty", "patientId", "competence", "dueDate", "amountCents"] as const) {
    if (before[key] !== after[key]) changes[key] = { from: null, to: null }
  }
  return changes
}

export const financialApi = {
  async list(filters: FinancialFilters = {}) {
    await simulateLatency()
    requirePermission(actor(), "finance:read")
    const q = filters.search?.trim().toLowerCase()
    return getDB()
      .financialEntries.filter((e) => !filters.competence || e.competence === filters.competence)
      .filter((e) => !filters.kind || filters.kind === "all" || e.kind === filters.kind)
      .filter(
        (e) =>
          !q ||
          e.code.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.counterparty?.toLowerCase().includes(q)
      )
      .map(derived)
      .filter((row) => !filters.status || filters.status === "all" || row.status === filters.status)
      .sort((a, b) => a.entry.dueDate.localeCompare(b.entry.dueDate) || a.entry.code.localeCompare(b.entry.code))
  },

  async get(id: string) {
    await simulateLatency()
    requirePermission(actor(), "finance:read")
    const entry = findEntry(id)
    const payments = getDB()
      .financialPayments.filter((p) => p.entryId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { ...derived(entry), payments }
  },

  async summary(competence: string) {
    await simulateLatency()
    requirePermission(actor(), "finance:read")
    const db = getDB()
    return summarize(db.financialEntries, db.financialPayments, competence, today())
  },

  async create(input: FinancialEntryInput) {
    await simulateLatency()
    const user = actor()
    requirePermission(user, "finance:write")
    const data = fields(parse<FinancialEntryInput>(financialEntrySchema, input))
    const db = getDB()
    db.counters.financial += 1
    const at = now()
    const entry: FinancialEntry = {
      ...data,
      id: uid("fe"),
      code: `LAN-${String(db.counters.financial).padStart(4, "0")}`,
      createdBy: user.id,
      createdAt: at,
      updatedAt: at,
    }
    db.financialEntries.push(entry)
    audit(user, "create", "financial_entry", entry.id, `Criou o lançamento ${entry.code}`)
    commit()
    return entry
  },

  async update(id: string, input: FinancialEntryInput) {
    await simulateLatency()
    const user = actor()
    requirePermission(user, "finance:write")
    const entry = findEntry(id)
    const data = fields(parse<FinancialEntryInput>(financialEntrySchema, input))
    validateEntryUpdate(
      entry,
      getDB().financialPayments.filter((p) => p.entryId === id),
      data
    )
    const next: FinancialEntry = { ...entry, ...data, updatedAt: now() }
    putEntry(next)
    audit(user, "update", "financial_entry", id, `Alterou o lançamento ${entry.code}`, changedFields(entry, next))
    commit()
    return next
  },

  /** RN-FIN-006: cancela sem apagar; só sem pagamentos ativos. */
  async cancel(id: string, input: ReasonInput) {
    await simulateLatency()
    const user = actor()
    requirePermission(user, "finance:write")
    const entry = findEntry(id)
    const data = parse<ReasonInput>(reasonSchema, input)
    validateCancellation(
      entry,
      getDB().financialPayments.filter((p) => p.entryId === id),
      data.reason
    )
    const at = now()
    putEntry({ ...entry, cancelledAt: at, cancelledBy: user.id, cancelReason: data.reason, updatedAt: at })
    audit(user, "status_change", "financial_entry", id, `Cancelou o lançamento ${entry.code}`)
    commit()
  },

  /** RN-FIN-003/004: baixa parcial até o saldo; a mesma `requestId` não gera segunda baixa. */
  async registerPayment(entryId: string, input: PaymentInput) {
    await simulateLatency()
    const user = actor()
    requirePermission(user, "finance:write")
    const entry = findEntry(entryId)
    const data = parse<PaymentInput>(paymentSchema, input)
    const db = getDB()
    const repeated = db.financialPayments.find((p) => p.requestId === data.requestId)
    if (repeated) {
      if (repeated.entryId !== entryId) throw new ValidationError("Identificador de pagamento já utilizado em outro lançamento.")
      return repeated
    }
    const amountCents = amountToCents(data.amount)
    validatePayment(
      entry,
      db.financialPayments.filter((p) => p.entryId === entryId),
      { amountCents, paidAt: data.paidAt },
      today()
    )
    const payment: FinancialPayment = {
      id: uid("fp"),
      entryId,
      amountCents,
      paidAt: data.paidAt,
      method: data.method,
      requestId: data.requestId,
      registeredBy: user.id,
      registeredByName: user.name,
      createdAt: now(),
    }
    db.financialPayments.push(payment)
    audit(user, "create", "financial_payment", payment.id, `Registrou pagamento do lançamento ${entry.code}`)
    commit()
    return payment
  },

  /** RN-FIN-007: o pagamento fica preservado, marcado como estornado. */
  async reversePayment(paymentId: string, input: ReasonInput) {
    await simulateLatency()
    const user = actor()
    requirePermission(user, "finance:write")
    const db = getDB()
    const index = db.financialPayments.findIndex((p) => p.id === paymentId)
    if (index < 0) throw new NotFoundError("Pagamento não encontrado.")
    const payment = db.financialPayments[index]
    const entry = findEntry(payment.entryId)
    const data = parse<ReasonInput>(reasonSchema, input)
    validateReversal(entry, payment, data.reason)
    db.financialPayments[index] = { ...payment, reversedAt: now(), reversedBy: user.id, reverseReason: data.reason }
    audit(user, "status_change", "financial_payment", paymentId, `Estornou pagamento do lançamento ${entry.code}`)
    commit()
  },
}

export type FinancialRow = Awaited<ReturnType<typeof financialApi.list>>[number]
