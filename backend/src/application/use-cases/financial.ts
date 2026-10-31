import type {
  CancelFinancialEntryCommand,
  CreateFinancialEntryCommand,
  FinancialAudit,
  FinancialMutation,
  FinancialPayload,
  FinancialPayment,
  FinancialQueryRepository,
  FinancialRecord,
  FinancialRepository,
  FinancialSummary,
  GetFinancialEntryQuery,
  GetFinancialSummaryQuery,
  ListFinancialEntriesQuery,
  RegisterPaymentCommand,
  ReversePaymentCommand,
  UpdateFinancialEntryCommand,
} from "@/application/ports/financial"
import type { Actor } from "@/application/ports/patient-access"
import { assertAuthenticated, fieldsOf, isRecord, listOf } from "@/application/use-cases/clinical-payload"
import { withLegacyCreationDefaults } from "@/application/use-cases/legacy-defaults"
import {
  activePaidCents,
  validateCancellation,
  validatePayment,
  validateReversal,
  type FinancialEntry,
  type Payment,
} from "@/domain/financial"

const CANCELLED = "cancelled"
/** Set only by `registerPayment` and `cancelEntry`; a generic update can never carry them. */
const ACTION_FIELDS = ["payments", "status"] as const
const COMPETENCE = /^\d{4}-\d{2}$/
const MAX_DESCRIPTION_LENGTH = 120

export interface FinancialRuntime {
  now(): Date
  newId(): string
}

const systemRuntime: FinancialRuntime = { now: () => new Date(), newId: () => crypto.randomUUID() }

function auditEntry(action: FinancialAudit["action"], changedFields: readonly string[]): FinancialAudit {
  return { action, summary: "Alterou financial-entry", changedFields }
}

/** Create and update rules: a positive whole amount, a `YYYY-MM` competence and a short description. */
function validEntry(body: unknown): FinancialPayload {
  if (!isRecord(body)) throw new Error("validation")
  const { amountCents, competence, description } = body
  const validAmount = typeof amountCents === "number" && Number.isInteger(amountCents) && amountCents > 0
  const tooLong = typeof description === "string" && description.length > MAX_DESCRIPTION_LENGTH
  if (!validAmount || !COMPETENCE.test(String(competence ?? "")) || tooLong) throw new Error("validation")
  return body
}

function paymentOf(stored: Record<string, unknown>): Payment {
  return {
    amountCents: typeof stored.amountCents === "number" ? stored.amountCents : 0,
    reversedAt: stored.reversedAt ? String(stored.reversedAt) : null,
  }
}

/** The domain view of a stored entry, for the pure financial rules. */
function entryOf(record: FinancialRecord): FinancialEntry {
  return {
    amountCents: typeof record.amountCents === "number" ? record.amountCents : 0,
    dueDate: typeof record.dueDate === "string" ? record.dueDate : "",
    cancelledAt: record.cancelledAt ? String(record.cancelledAt) : null,
    payments: listOf(record.payments).filter(isRecord).map(paymentOf),
  }
}

function totalsByType(items: readonly FinancialRecord[]): Record<string, number> {
  const totals = new Map<string, number>()
  for (const item of items) {
    if (item.status === CANCELLED) continue
    const type = String(item.type)
    totals.set(type, (totals.get(type) ?? 0) + (typeof item.amountCents === "number" ? item.amountCents : 0))
  }
  return Object.fromEntries(totals)
}

async function load(repository: FinancialQueryRepository, clinicId: string, id: string): Promise<FinancialRecord> {
  const record = await repository.findById(clinicId, id)
  if (!record) throw new Error("not_found")
  return record
}

export function createFinancialQueries(repository: FinancialQueryRepository) {
  return {
    listEntries: (query: ListFinancialEntriesQuery) =>
      repository.find({ clinicId: query.clinicId, filters: query.filters }),
    getEntry: (query: GetFinancialEntryQuery) => load(repository, query.clinicId, query.id),
    async summary(query: GetFinancialSummaryQuery): Promise<FinancialSummary> {
      const items = await repository.find({ clinicId: query.clinicId, filters: {} })
      return { items, totals: totalsByType(items) }
    },
  }
}

export function createFinancialCommands(repository: FinancialRepository, runtime: FinancialRuntime = systemRuntime) {
  /** Runs `decide` on the locked entry; the entry is always loaded and locked before any rule is checked. */
  async function change<T>(
    clinicId: string,
    actor: Actor,
    id: string,
    decide: (current: FinancialRecord) => FinancialMutation<T>,
  ) {
    const changed = await repository.change({ clinicId, id, actorId: actor.userId, change: decide })
    if (changed.outcome === "not_found") throw new Error("not_found")
    return changed
  }

  return {
    async createEntry(command: CreateFinancialEntryCommand): Promise<FinancialRecord> {
      const payload = validEntry(command.body)
      return repository.insert({
        clinicId: command.clinicId,
        actorId: command.actor.userId,
        payload: withLegacyCreationDefaults(payload, command.actor.userId),
        audit: auditEntry("create", Object.keys(payload)),
      })
    },
    /** `payments` and `status` belong to the dedicated actions and are refused. */
    async updateEntry(command: UpdateFinancialEntryCommand): Promise<FinancialRecord> {
      const patch = validEntry(command.body)
      if (ACTION_FIELDS.some((field) => field in patch)) throw new Error("validation")
      const { record } = await change(command.clinicId, command.actor, command.id, () => ({
        patch,
        audit: auditEntry("update", Object.keys(patch)),
        result: undefined,
      }))
      return record
    },
    /** Returns the payment; a repeated `requestId` returns the stored payment without writing anything. */
    async registerPayment(command: RegisterPaymentCommand): Promise<FinancialPayment> {
      assertAuthenticated(command.actor)
      const { result } = await change<FinancialPayment>(command.clinicId, command.actor, command.id, (locked) => {
        const { requestId, amountCents, paidAt, method } = fieldsOf(command.body)
        if (typeof requestId !== "string" || !requestId.trim()) throw new Error("validation")
        const stored = listOf(locked.payments)
        const prior = stored.find((payment) => isRecord(payment) && payment.requestId === requestId)
        if (isRecord(prior)) return { result: prior }
        const entry = entryOf(locked)
        const amount = typeof amountCents === "number" ? amountCents : Number.NaN
        validatePayment(entry, amount, typeof paidAt === "string" ? paidAt : "", runtime.now().toISOString().slice(0, 10))
        const payment: FinancialPayment = {
          id: runtime.newId(),
          amountCents: amount,
          paidAt,
          method,
          requestId,
          reversedAt: null,
          createdBy: command.actor.userId,
        }
        const paid = activePaidCents(entry.payments) + amount
        return {
          patch: {
            payments: [...stored, payment],
            status: paid >= entry.amountCents ? "paid" : "partial",
            balanceCents: entry.amountCents - paid,
          },
          audit: { action: "payment", summary: "Pagamento registrado" },
          result: payment,
        }
      })
      return result
    },
    /** An entry is cancelled once, with a reason, and the cancellation is audited. */
    async cancelEntry(command: CancelFinancialEntryCommand): Promise<FinancialRecord> {
      assertAuthenticated(command.actor)
      const { record } = await change(command.clinicId, command.actor, command.id, (locked) => {
        const { reason } = fieldsOf(command.body)
        validateCancellation(entryOf(locked), String(reason ?? ""))
        if (locked.status === CANCELLED || locked.cancelledAt) throw new Error("conflict")
        const patch = { status: CANCELLED, cancelledAt: runtime.now().toISOString(), cancelReason: reason }
        return { patch, audit: auditEntry("update", Object.keys(patch)), result: undefined }
      })
      return record
    },
    /** Reverses one payment of the entry that holds it; the entry's status and balance are left as stored. */
    async reversePayment(command: ReversePaymentCommand): Promise<FinancialRecord> {
      assertAuthenticated(command.actor)
      const holds = (entry: FinancialRecord) =>
        listOf(entry.payments).some((payment) => isRecord(payment) && payment.id === command.paymentId)
      const holder = (await repository.find({ clinicId: command.clinicId, filters: {} })).find(holds)
      if (!holder) throw new Error("not_found")
      const { record } = await change(command.clinicId, command.actor, holder.id, (locked) => {
        const { reason } = fieldsOf(command.body)
        const stored = listOf(locked.payments)
        const target = stored.find((payment) => isRecord(payment) && payment.id === command.paymentId)
        if (!isRecord(target)) throw new Error("not_found")
        validateReversal(paymentOf(target), String(reason ?? ""))
        validEntry(locked)
        const reversal = { reversedAt: runtime.now().toISOString(), reverseReason: reason, reversedBy: command.actor.userId }
        const payments = stored.map((payment) =>
          isRecord(payment) && payment.id === command.paymentId ? { ...payment, ...reversal } : payment,
        )
        return {
          patch: { payments },
          audit: auditEntry("update", Object.keys({ ...locked, payments })),
          result: undefined,
        }
      })
      return record
    },
  }
}

export function createFinancialUseCases(repository: FinancialRepository, runtime: FinancialRuntime = systemRuntime) {
  return {
    queries: createFinancialQueries(repository),
    commands: createFinancialCommands(repository, runtime),
  }
}

export type FinancialUseCases = ReturnType<typeof createFinancialUseCases>
