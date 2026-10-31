import { clinicDateKey } from "@/domain/clinic-time"
import { ValidationError } from "@/domain/errors"
import {
  amountToCents,
  balanceCents,
  entryStatus,
  paidCents,
  summarize,
  validateCancellation,
  validateEntryUpdate,
  validatePayment,
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

import type { Row } from "./backend-mappers"
import { toFinancialEntry, toFinancialPayment, toFinancialPayments } from "./financial-mappers"
import {
  reportQueryOf,
  searchQueryOf,
  toFinancialExport,
  toFinancialPage,
  toFinancialReport,
  type FinancialExportResult,
  type FinancialListRow,
  type FinancialPage,
  type FinancialQueryFilters,
  type FinancialReport,
  type FinancialSearchParams,
} from "./financial-report-mappers"
import { items, now, parse, seg, whenForbidden } from "./helpers"
import { http } from "./http-client"
import { loadPatients } from "./patient-directory"

// RN-FIN-009: o módulo lê só os lançamentos e a referência opcional a paciente. A API decide o acesso
// (`finance:read` / `finance:write`) e registra a auditoria sem valores (RN-FIN-010/011).

export interface FinancialFilters {
  competence?: string
  kind?: FinancialKind | "all"
  status?: FinancialEntryStatus | "all"
  search?: string
}

const today = () => clinicDateKey(new Date())

interface Loaded {
  entry: FinancialEntry
  payments: FinancialPayment[]
}

const loaded = (row: Row): Loaded => ({ entry: toFinancialEntry(row), payments: toFinancialPayments(row) })

function derived({ entry, payments }: Loaded) {
  return {
    entry,
    paidCents: paidCents(payments),
    balanceCents: balanceCents(entry, payments),
    status: entryStatus(entry, payments, today()),
  }
}

async function fetchAll(): Promise<Loaded[]> {
  return (await items("/financial/entries")).map(loaded)
}

async function fetchOne(id: string): Promise<Loaded> {
  return loaded(await http.get<Row>(`/financial/entries/${seg(id)}`, { errors: { 404: "Lançamento não encontrado." } }))
}

/** Campos do lançamento no formato da API: `type` é o que ela soma nos totais; `kind` mantém o nome da UI. */
async function fields(data: FinancialEntryInput) {
  if (data.patientId) {
    const patients = await loadPatients().catch(whenForbidden(null))
    if (patients && !patients.some((p) => p.id === data.patientId)) throw new ValidationError("Paciente não encontrado.")
  }
  return {
    kind: data.kind,
    type: data.kind,
    description: data.description,
    category: data.category,
    counterparty: data.counterparty || null,
    patientId: data.patientId || null,
    competence: data.competence,
    dueDate: data.dueDate,
    amountCents: amountToCents(data.amount),
  }
}

export const financialApi = {
  async list(filters: FinancialFilters = {}) {
    const q = filters.search?.trim().toLowerCase()
    return (await fetchAll())
      .filter(({ entry: e }) => !filters.competence || e.competence === filters.competence)
      .filter(({ entry: e }) => !filters.kind || filters.kind === "all" || e.kind === filters.kind)
      .filter(
        ({ entry: e }) =>
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

  /** Indicadores, séries e distribuições do filtro atual (`GET /financial/report`). */
  async report(filters: FinancialQueryFilters): Promise<FinancialReport> {
    return toFinancialReport(await http.get<Row>("/financial/report", { query: reportQueryOf(filters) }))
  },

  /** Uma página dos lançamentos filtrados, paginada e ordenada no servidor (`GET /financial/entries/search`). */
  async search(filters: FinancialQueryFilters, params: FinancialSearchParams): Promise<FinancialPage> {
    return toFinancialPage(await http.get<Row>("/financial/entries/search", { query: searchQueryOf(filters, params) }))
  },

  /**
   * Todos os lançamentos do filtro atual, sem paginação, para a planilha (`GET /financial/export`, exige
   * `finance:export`). A API não conhece o nome do paciente: ele é juntado aqui quando o perfil lê pacientes.
   */
  async export(filters: FinancialQueryFilters): Promise<FinancialExportResult & { patientNames: Record<string, string> }> {
    const result = toFinancialExport(
      await http.get<Row>("/financial/export", {
        query: reportQueryOf(filters),
        errors: { 403: "Seu perfil não pode exportar o financeiro." },
      })
    )
    const patients = result.rows.some(({ entry }) => entry.patientId) ? await loadPatients().catch(whenForbidden(null)) : null
    const patientNames = Object.fromEntries((patients ?? []).map((p) => [p.id, p.fullName]))
    return { ...result, patientNames }
  },

  async get(id: string) {
    const current = await fetchOne(id)
    // A API guarda os pagamentos em ordem de registro; o mais recente aparece primeiro.
    return { ...derived(current), payments: [...current.payments].reverse() }
  },

  /** RF-FIN-003: resumo por competência calculado dos lançamentos e pagamentos reais. */
  async summary(competence: string) {
    const all = await fetchAll()
    return summarize(
      all.map((l) => l.entry),
      all.flatMap((l) => l.payments),
      competence,
      today()
    )
  },

  async create(input: FinancialEntryInput) {
    const data = await fields(parse<FinancialEntryInput>(financialEntrySchema, input))
    const at = now()
    const created = await http.post<Row>("/financial/entries", {
      body: { ...data, status: "open", createdAt: at, updatedAt: at },
    })
    return toFinancialEntry(created)
  },

  async update(id: string, input: FinancialEntryInput) {
    const { entry, payments } = await fetchOne(id)
    const data = await fields(parse<FinancialEntryInput>(financialEntrySchema, input))
    validateEntryUpdate(entry, payments, data)
    const saved = await http.patch<Row>(`/financial/entries/${seg(id)}`, {
      body: { ...data, updatedAt: now() },
      errors: { 404: "Lançamento não encontrado." },
    })
    return toFinancialEntry(saved)
  },

  /** RN-FIN-006: cancela sem apagar; só sem pagamentos ativos. */
  async cancel(id: string, input: ReasonInput) {
    const { entry, payments } = await fetchOne(id)
    const data = parse<ReasonInput>(reasonSchema, input)
    validateCancellation(entry, payments, data.reason)
    await http.post(`/financial/entries/${seg(id)}/cancel`, {
      body: { reason: data.reason },
      errors: { 404: "Lançamento não encontrado.", 409: "Estorne os pagamentos ativos antes de cancelar o lançamento." },
    })
  },

  /** RN-FIN-003/004: baixa parcial até o saldo; a mesma `requestId` não gera segunda baixa. */
  async registerPayment(entryId: string, input: PaymentInput) {
    const { entry, payments } = await fetchOne(entryId)
    const data = parse<PaymentInput>(paymentSchema, input)
    const repeated = payments.find((p) => p.requestId === data.requestId)
    if (repeated) return repeated
    const amountCents = amountToCents(data.amount)
    validatePayment(entry, payments, { amountCents, paidAt: data.paidAt }, today())
    const created = await http.post<Row>(`/financial/entries/${seg(entryId)}/payments`, {
      body: { requestId: data.requestId, amountCents, paidAt: data.paidAt, method: data.method },
      errors: { 404: "Lançamento não encontrado." },
    })
    return toFinancialPayment(created, entryId)
  },

  /** RN-FIN-007: o pagamento fica preservado, marcado como estornado. */
  async reversePayment(paymentId: string, input: ReasonInput) {
    const data = parse<ReasonInput>(reasonSchema, input)
    await http.post(`/financial/payments/${seg(paymentId)}/reverse`, {
      body: { reason: data.reason },
      errors: { 404: "Pagamento não encontrado.", 409: "Este pagamento já foi estornado." },
    })
  },
}

export type FinancialRow = Awaited<ReturnType<typeof financialApi.list>>[number]

export type { FinancialExportResult, FinancialListRow, FinancialPage, FinancialQueryFilters, FinancialReport, FinancialSearchParams }
