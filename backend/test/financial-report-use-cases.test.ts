import { beforeEach, describe, expect, test } from "bun:test"
import { DomainError } from "@/application/errors"
import type { Actor } from "@/application/ports/patient-access"
import { createFinancialReportUseCases } from "@/application/use-cases/financial-report"
import { EXPORT_LIMIT, SCAN_LIMIT, type QuerySource, type SourceRow } from "@/domain/financial-report"
import { FakeFinancialReportRepository } from "./fakes/financial-report-repository"
import { FakePermissions } from "./fakes/permissions"

const source = (params: Record<string, string | string[]> = {}): QuerySource => ({
  one: (name) => (Array.isArray(params[name]) ? params[name][0] : (params[name] as string | undefined)),
  many: (name) => (params[name] === undefined ? [] : Array.isArray(params[name]) ? params[name] : [params[name] as string]),
})

const row = (id: string, payload: Record<string, unknown> = {}): SourceRow => ({
  id,
  payload: { type: "income", description: "Sessão", category: "Consulta", competence: "2026-10", dueDate: "2026-10-20", amountCents: 10_000, payments: [], ...payload },
  createdAt: "2026-10-01T12:00:00.000Z",
})

const actor: Actor = { userId: "user-1", roles: ["finance"], permissions: ["finance:read", "finance:export"] }

let repository: FakeFinancialReportRepository
let permissions: FakePermissions
// 2026-11-01 01:30 UTC is still 2026-10-31 in the clinic: "today" is read in America/Sao_Paulo.
const useCases = () => createFinancialReportUseCases(repository, permissions, { now: () => new Date("2026-11-01T01:30:00Z") })

beforeEach(() => {
  repository = new FakeFinancialReportRepository()
  permissions = new FakePermissions()
  permissions.granted = new Set(["finance:read", "finance:export"])
})

describe("financial report use cases", () => {
  test("the report narrows the database only with the coarse filters and judges overdue on the clinic's today", async () => {
    repository.rows = [row("a", { dueDate: "2026-10-31" }), row("b", { dueDate: "2026-10-30" })]
    const report = await useCases().queries.report({
      clinicId: "clinic", actor, query: source({ from: "2026-10-01", kind: "income", status: "overdue", method: "pix" }),
    })
    expect(repository.scans).toEqual([
      { clinicId: "clinic", filters: { from: "2026-10-01", to: undefined, kind: "income", competence: undefined, q: undefined, minCents: undefined, maxCents: undefined }, limit: SCAN_LIMIT + 1 },
    ])
    // Due on the clinic's today is not overdue yet; the day before is. The method filter then drops both (no payments).
    expect(report.indicators.entryCount).toBe(0)
    const overdue = await useCases().queries.report({ clinicId: "clinic", actor, query: source({ status: "overdue" }) })
    expect(overdue.indicators).toMatchObject({ entryCount: 1, overdueCents: 10_000 })
  })

  test("search paginates on the server and reports the total", async () => {
    repository.rows = Array.from({ length: 5 }, (_, i) => row(`e${i}`, { amountCents: (i + 1) * 100, dueDate: `2026-10-0${i + 1}` }))
    const page = await useCases().queries.search({
      clinicId: "clinic", actor, query: source({ page: "2", pageSize: "2", sort: "amount", dir: "desc" }),
    })
    expect(page).toMatchObject({ total: 5, page: 2, pageSize: 2 })
    expect(page.items.map((item) => item.id)).toEqual(["e2", "e1"])
    expect(page.items[0]).toMatchObject({ code: "LAN-E2", situation: "overdue", balanceCents: 300 })
    expect("payments" in page.items[0]).toBe(false)
  })

  test("invalid filters and search parameters are validation errors with a pt-BR message", async () => {
    const run = (queryParams: Record<string, string>) => useCases().queries.search({ clinicId: "clinic", actor, query: source(queryParams) })
    await expect(run({ from: "2026-02-31" })).rejects.toMatchObject({ message: "validation", detail: "Data inicial inválida (use AAAA-MM-DD)." })
    await expect(run({ pageSize: "500" })).rejects.toBeInstanceOf(DomainError)
    expect(repository.scans).toEqual([]) // nothing is read for an invalid request
  })

  test("a scan that overflows the cap asks the user to narrow the filters", async () => {
    repository.rows = Array.from({ length: SCAN_LIMIT + 1 }, (_, i) => row(`id${i}`))
    await expect(useCases().queries.report({ clinicId: "clinic", actor, query: source() })).rejects.toMatchObject({
      message: "validation", detail: expect.stringContaining("Refine"),
    })
  })
})

describe("financial export", () => {
  test("returns every match ordered by due date, and audits only the count", async () => {
    repository.rows = [row("late", { dueDate: "2026-10-25" }), row("early", { dueDate: "2026-10-05", amountCents: 777_00 }), row("other", { type: "expense" })]
    const result = await useCases().commands.exportEntries({ clinicId: "clinic", actor, query: source({ kind: "income" }) })
    expect(result.total).toBe(2)
    expect(result.items.map((item) => item.id)).toEqual(["early", "late"])
    expect(repository.exports).toEqual([{ clinicId: "clinic", actorId: "user-1", count: 2 }])
  })

  test("needs finance:export and finance:read, and audits nothing when refused", async () => {
    repository.rows = [row("a")]
    for (const missing of ["finance:export", "finance:read"]) {
      permissions.granted = new Set(["finance:read", "finance:export"].filter((key) => key !== missing))
      await expect(useCases().commands.exportEntries({ clinicId: "clinic", actor, query: source() })).rejects.toMatchObject({
        message: "forbidden", detail: "Seu perfil não pode exportar o financeiro.",
      })
    }
    expect(repository.scans).toEqual([])
    expect(repository.exports).toEqual([])
  })

  test("refuses the internal system actor", async () => {
    await expect(
      useCases().commands.exportEntries({ clinicId: "clinic", actor: { ...actor, userId: "system" }, query: source() }),
    ).rejects.toMatchObject({ message: "unauthorized" })
  })

  test("refuses more than the export limit, without auditing", async () => {
    repository.rows = Array.from({ length: EXPORT_LIMIT + 1 }, (_, i) => row(`id${i}`))
    await expect(useCases().commands.exportEntries({ clinicId: "clinic", actor, query: source() })).rejects.toMatchObject({
      message: "validation", detail: expect.stringContaining("10.000"),
    })
    expect(repository.exports).toEqual([])
    // Exactly at the limit is fine.
    repository.rows = Array.from({ length: EXPORT_LIMIT }, (_, i) => row(`id${i}`))
    expect((await useCases().commands.exportEntries({ clinicId: "clinic", actor, query: source() })).total).toBe(EXPORT_LIMIT)
    expect(repository.exports).toEqual([{ clinicId: "clinic", actorId: "user-1", count: EXPORT_LIMIT }])
  })

  test("an empty export is still audited (count 0) and valid", async () => {
    expect(await useCases().commands.exportEntries({ clinicId: "clinic", actor, query: source() })).toEqual({ items: [], total: 0 })
    expect(repository.exports).toEqual([{ clinicId: "clinic", actorId: "user-1", count: 0 }])
  })
})
