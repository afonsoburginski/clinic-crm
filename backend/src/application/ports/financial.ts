import type { Actor } from "@/application/ports/patient-access"

export type FinancialPayload = Record<string, unknown>
export interface FinancialRecord { id: string; [field: string]: unknown }
export type FinancialPayment = Record<string, unknown>

export interface FinancialFilters { patientId?: string; status?: string; from?: string; to?: string }

export interface ListFinancialEntriesQuery { clinicId: string; filters: FinancialFilters }
export interface GetFinancialEntryQuery { clinicId: string; id: string }
export interface GetFinancialSummaryQuery { clinicId: string }

/** Every entry plus the sum of `amountCents` per entry `type`, ignoring cancelled entries. */
export interface FinancialSummary { items: FinancialRecord[]; totals: Record<string, number> }

/** `body` is the raw request payload; use cases validate it before it reaches the repository. */
export interface CreateFinancialEntryCommand { clinicId: string; actor: Actor; body: unknown }
export interface UpdateFinancialEntryCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface RegisterPaymentCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface CancelFinancialEntryCommand { clinicId: string; actor: Actor; id: string; body: unknown }
export interface ReversePaymentCommand { clinicId: string; actor: Actor; paymentId: string; body: unknown }

export interface FindFinancialEntriesQuery { clinicId: string; filters: FinancialFilters }

/** `changedFields`, when given, is recorded as the audit `changes`; without it `changes` stays NULL. */
export interface FinancialAudit {
  action: "create" | "update" | "payment"
  summary: string
  changedFields?: readonly string[]
}

export interface InsertFinancialEntryCommand {
  clinicId: string
  actorId: string
  payload: FinancialPayload
  audit: FinancialAudit
}

/**
 * What a change decided: the fields to merge (none leaves the row untouched), the audit entry
 * (none records nothing), and the value handed back to the caller.
 */
export interface FinancialMutation<T> {
  patch?: FinancialPayload
  audit?: FinancialAudit
  result: T
}

/** Runs against the entry under lock; it may throw to abort. */
export type FinancialChange<T> = (current: FinancialRecord) => FinancialMutation<T>

export interface ChangeFinancialEntryCommand<T> {
  clinicId: string
  id: string
  actorId: string
  change: FinancialChange<T>
}

export type ChangeFinancialEntryResult<T> =
  | { outcome: "done"; record: FinancialRecord; result: T }
  | { outcome: "not_found" }

export interface FinancialQueryRepository {
  find(query: FindFinancialEntriesQuery): Promise<FinancialRecord[]>
  findById(clinicId: string, id: string): Promise<FinancialRecord | undefined>
}

export interface FinancialCommandRepository {
  insert(command: InsertFinancialEntryCommand): Promise<FinancialRecord>
  change<T>(command: ChangeFinancialEntryCommand<T>): Promise<ChangeFinancialEntryResult<T>>
}

export interface FinancialRepository extends FinancialQueryRepository, FinancialCommandRepository {}
