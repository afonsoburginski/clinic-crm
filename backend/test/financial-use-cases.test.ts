import { describe, expect, test } from "bun:test"
import type { FinancialRecord } from "@/application/ports/financial"
import type { Actor } from "@/application/ports/patient-access"
import {
  createFinancialCommands,
  createFinancialQueries,
  type FinancialRuntime,
} from "@/application/use-cases/financial"
import { FakeFinancialRepository } from "./fakes/financial-repository"

const clinicId = "clinic"
const finance: Actor = { userId: "fin-1", roles: ["finance"] }
const now = "2025-03-01T12:00:00.000Z"
const runtime: FinancialRuntime = { now: () => new Date(now), newId: () => "pay-new" }
const payment = { id: "pay1", amountCents: 4_000, paidAt: "2025-02-01", requestId: "r0", reversedAt: null }

function entry(fields: Partial<FinancialRecord> = {}): FinancialRecord {
  return { id: "e1", amountCents: 10_000, competence: "2025-02", dueDate: "2025-03-10", type: "income", status: "draft", ...fields }
}

function setup(...records: FinancialRecord[]) {
  const repository = new FakeFinancialRepository()
  repository.records = records
  return {
    repository,
    queries: createFinancialQueries(repository),
    commands: createFinancialCommands(repository, runtime),
  }
}

describe("financial queries", () => {
  test("lists and gets entries", async () => {
    const { repository, queries } = setup(entry())
    const filters = { patientId: "p1", status: "draft", from: "2025-01-01", to: "2025-02-01" }
    expect(await queries.listEntries({ clinicId, filters })).toEqual([entry()])
    expect(repository.found[0]).toEqual({ clinicId, filters })
    expect(await queries.getEntry({ clinicId, id: "e1" })).toEqual(entry())
    await expect(queries.getEntry({ clinicId, id: "missing" })).rejects.toThrow("not_found")
  })

  test("sums amounts per type and ignores cancelled entries", async () => {
    const { repository, queries } = setup(
      entry({ amountCents: 100 }),
      entry({ id: "e2", amountCents: 250, status: "paid" }),
      entry({ id: "e3", amountCents: 70, type: "expense" }),
      entry({ id: "e4", amountCents: 999, status: "cancelled" }),
      entry({ id: "e5", amountCents: 5, type: undefined }),
    )
    const summary = await queries.summary({ clinicId })
    expect(summary.items).toBe(repository.records)
    expect(summary.totals).toEqual({ income: 350, expense: 70, undefined: 5 })
    expect(repository.found[0]).toEqual({ clinicId, filters: {} })
  })

  test("an empty ledger has no totals", async () => {
    const { queries } = setup()
    expect(await queries.summary({ clinicId })).toEqual({ items: [], totals: {} })
  })
})

describe("financial commands", () => {
  describe("create and update", () => {
    const body = { amountCents: 5_000, competence: "2025-03", description: "Mensalidade" }

    test("creates a draft authored by the actor and audits the fields sent", async () => {
      const { repository, commands } = setup()
      expect(await commands.createEntry({ clinicId, actor: finance, body }))
        .toEqual({ id: "new", ...body, createdBy: "fin-1", status: "draft" })
      expect(repository.inserted[0]).toMatchObject({ clinicId, actorId: "fin-1" })
      expect(repository.audits).toEqual([
        { action: "create", summary: "Alterou financial-entry", changedFields: ["amountCents", "competence", "description"] },
      ])
    })

    test("legacy: a client-sent status and payments are stored as sent", async () => {
      const { commands } = setup()
      const created = await commands.createEntry({ clinicId, actor: finance, body: { ...body, status: "paid", payments: [payment] } })
      expect(created).toMatchObject({ status: "paid", payments: [payment] })
    })

    test.each([
      ["no body", null],
      ["a list body", []],
      ["no amount", { ...body, amountCents: undefined }],
      ["a fractional amount", { ...body, amountCents: 10.5 }],
      ["a zero amount", { ...body, amountCents: 0 }],
      ["a negative amount", { ...body, amountCents: -1 }],
      ["an amount as text", { ...body, amountCents: "100" }],
      ["no competence", { ...body, competence: undefined }],
      ["a malformed competence", { ...body, competence: "2025-3" }],
      ["a full date as competence", { ...body, competence: "2025-03-01" }],
      ["a long description", { ...body, description: "x".repeat(121) }],
    ])("rejects %s", async (_name, invalid) => {
      const { repository, commands } = setup(entry())
      await expect(commands.createEntry({ clinicId, actor: finance, body: invalid })).rejects.toThrow("validation")
      await expect(commands.updateEntry({ clinicId, actor: finance, id: "e1", body: invalid })).rejects.toThrow("validation")
      expect(repository.inserted).toEqual([])
      expect(repository.written).toEqual([])
    })

    test("accepts a description of exactly 120 characters and none at all", async () => {
      const { commands } = setup()
      await commands.createEntry({ clinicId, actor: finance, body: { ...body, description: "x".repeat(120) } })
      await commands.createEntry({ clinicId, actor: finance, body: { amountCents: 1, competence: "2025-01" } })
    })

    test("updates an entry, auditing the fields sent", async () => {
      const { repository, commands } = setup(entry())
      expect(await commands.updateEntry({ clinicId, actor: finance, id: "e1", body })).toEqual({ ...entry(), ...body })
      expect(repository.written).toEqual([{ id: "e1", patch: body }])
      expect(repository.audits).toEqual([
        { action: "update", summary: "Alterou financial-entry", changedFields: Object.keys(body) },
      ])
      await expect(commands.updateEntry({ clinicId, actor: finance, id: "missing", body })).rejects.toThrow("not_found")
    })

    test.each([
      ["status", { status: "paid" }],
      ["payments", { payments: [payment] }],
      ["status and payments", { status: "paid", payments: [payment] }],
    ])("refuses an update that carries %s, reserved to the payment and cancel actions", async (_name, reserved) => {
      const { repository, commands } = setup(entry())
      await expect(commands.updateEntry({ clinicId, actor: finance, id: "e1", body: { ...body, ...reserved } }))
        .rejects.toThrow("validation")
      expect(repository.written).toEqual([])
      expect(repository.audits).toEqual([])
    })
  })

  describe("register payment", () => {
    const pay = (id: string, body: unknown, actor: Actor = finance) =>
      ({ clinicId, actor, id, body })

    test("records a partial payment, then a settling one", async () => {
      const { repository, commands } = setup(entry())
      const first = await commands.registerPayment(
        pay("e1", { requestId: "r1", amountCents: 4_000, paidAt: "2025-02-28", method: "pix" }),
      )
      expect(first).toEqual({
        id: "pay-new", amountCents: 4_000, paidAt: "2025-02-28", method: "pix", requestId: "r1", reversedAt: null, createdBy: "fin-1",
      })
      expect(repository.written[0].patch).toEqual({ payments: [first], status: "partial", balanceCents: 6_000 })
      expect(repository.audits).toEqual([{ action: "payment", summary: "Pagamento registrado" }])

      repository.records = [entry({ payments: [payment] })]
      await commands.registerPayment(pay("e1", { requestId: "r2", amountCents: 6_000, paidAt: "2025-03-01" }))
      expect(repository.written[1].patch).toMatchObject({ status: "paid", balanceCents: 0 })
    })

    test("ignores reversed payments when working out the balance", async () => {
      const reversed = { ...payment, reversedAt: "2025-02-02T00:00:00.000Z" }
      const { repository, commands } = setup(entry({ payments: [reversed] }))
      await commands.registerPayment(pay("e1", { requestId: "r1", amountCents: 10_000, paidAt: "2025-03-01" }))
      expect(repository.written[0].patch).toMatchObject({ status: "paid", balanceCents: 0 })
      expect((repository.written[0].patch.payments as unknown[]).length).toBe(2)
    })

    test("a repeated request id returns the stored payment and writes nothing", async () => {
      const { repository, commands } = setup(entry({ payments: [payment] }))
      expect(await commands.registerPayment(pay("e1", { requestId: "r0", amountCents: 1, paidAt: "bad" }))).toEqual(payment)
      expect(repository.written).toEqual([])
      expect(repository.audits).toEqual([])
    })

    test.each([
      ["no request id", { amountCents: 100, paidAt: "2025-03-01" }],
      ["a blank request id", { requestId: "  ", amountCents: 100, paidAt: "2025-03-01" }],
      ["a request id that is not text", { requestId: 7, amountCents: 100, paidAt: "2025-03-01" }],
      ["no amount", { requestId: "r1", paidAt: "2025-03-01" }],
      ["an amount as text", { requestId: "r1", amountCents: "100", paidAt: "2025-03-01" }],
      ["a fractional amount", { requestId: "r1", amountCents: 1.5, paidAt: "2025-03-01" }],
      ["a zero amount", { requestId: "r1", amountCents: 0, paidAt: "2025-03-01" }],
      ["more than the balance", { requestId: "r1", amountCents: 10_001, paidAt: "2025-03-01" }],
      ["no payment date", { requestId: "r1", amountCents: 100 }],
      ["a malformed payment date", { requestId: "r1", amountCents: 100, paidAt: "01/03/2025" }],
      ["a payment date in the future", { requestId: "r1", amountCents: 100, paidAt: "2025-03-02" }],
      ["no body", null],
    ])("rejects %s", async (_name, body) => {
      const { repository, commands } = setup(entry())
      await expect(commands.registerPayment(pay("e1", body))).rejects.toThrow("validation")
      expect(repository.written).toEqual([])
    })

    test("accepts a payment dated today", async () => {
      const { commands } = setup(entry())
      await commands.registerPayment(pay("e1", { requestId: "r1", amountCents: 100, paidAt: "2025-03-01" }))
    })

    test("rejects paying a cancelled or fully paid entry", async () => {
      const body = { requestId: "r1", amountCents: 100, paidAt: "2025-03-01" }
      const cancelled = setup(entry({ cancelledAt: now }))
      await expect(cancelled.commands.registerPayment(pay("e1", body))).rejects.toThrow("validation")
      const settled = setup(entry({ payments: [{ ...payment, amountCents: 10_000 }] }))
      await expect(settled.commands.registerPayment(pay("e1", body))).rejects.toThrow("validation")
    })

    test("needs an authenticated actor and an existing entry, found before the body is validated", async () => {
      const { commands } = setup(entry())
      await expect(commands.registerPayment(pay("e1", {}, { userId: "system", roles: [] }))).rejects.toThrow("unauthorized")
      await expect(commands.registerPayment(pay("e1", {}, { userId: "", roles: [] }))).rejects.toThrow("unauthorized")
      await expect(commands.registerPayment(pay("missing", {}))).rejects.toThrow("not_found")
    })
  })

  describe("cancel", () => {
    const cancel = (id: string, body: unknown, actor: Actor = finance) => ({ clinicId, actor, id, body })

    test("cancels an entry without payments, stamping when and why, and audits the cancellation", async () => {
      const { repository, commands } = setup(entry())
      expect(await commands.cancelEntry(cancel("e1", { reason: "Lançamento duplicado" }))).toEqual({
        ...entry(), status: "cancelled", cancelledAt: now, cancelReason: "Lançamento duplicado",
      })
      expect(repository.audits).toEqual([
        { action: "update", summary: "Alterou financial-entry", changedFields: ["status", "cancelledAt", "cancelReason"] },
      ])
    })

    test("cancels when every payment was reversed", async () => {
      const { commands } = setup(entry({ payments: [{ ...payment, reversedAt: now }] }))
      expect(await commands.cancelEntry(cancel("e1", { reason: "Lançamento duplicado" }))).toMatchObject({ status: "cancelled" })
    })

    test("needs a reason of at least five characters, and no active payment", async () => {
      const { commands } = setup(entry(), entry({ id: "e2", payments: [payment] }))
      for (const body of [{}, { reason: "    " }, { reason: "curt" }, null]) {
        await expect(commands.cancelEntry(cancel("e1", body))).rejects.toThrow("validation")
      }
      await expect(commands.cancelEntry(cancel("e2", { reason: "Lançamento duplicado" }))).rejects.toThrow("conflict")
    })

    test("an already cancelled entry cannot be cancelled again, and nothing is written or audited", async () => {
      const cancelled = { cancelledAt: "2025-01-01T00:00:00.000Z", cancelReason: "primeiro" }
      const { repository, commands } = setup(
        entry({ status: "cancelled", ...cancelled }),
        entry({ id: "e2", ...cancelled }),
        entry({ id: "e3", status: "cancelled" }),
      )
      for (const id of ["e1", "e2", "e3"]) {
        await expect(commands.cancelEntry(cancel(id, { reason: "segundo motivo" }))).rejects.toThrow("conflict")
      }
      expect(repository.written).toEqual([])
      expect(repository.audits).toEqual([])
    })

    test("needs an authenticated actor and an existing entry", async () => {
      const { commands } = setup(entry())
      await expect(commands.cancelEntry(cancel("e1", {}, { userId: "system", roles: [] }))).rejects.toThrow("unauthorized")
      await expect(commands.cancelEntry(cancel("missing", { reason: "Lançamento duplicado" }))).rejects.toThrow("not_found")
    })
  })

  describe("reverse payment", () => {
    const reverse = (paymentId: string, body: unknown, actor: Actor = finance) => ({ clinicId, actor, paymentId, body })
    const holder = entry({ id: "e1", status: "partial", balanceCents: 6_000, payments: [payment] })

    test("reverses a payment of the entry that holds it, leaving status and balance as stored", async () => {
      const other = entry({ id: "e0", payments: [{ id: "pay0" }] })
      const { repository, commands } = setup(other, holder)
      const result = await commands.reversePayment(reverse("pay1", { reason: "Erro no caixa" }))
      const reversed = { ...payment, reversedAt: now, reverseReason: "Erro no caixa", reversedBy: "fin-1" }
      expect(result).toEqual({ ...holder, payments: [reversed] })
      expect(result).toMatchObject({ status: "partial", balanceCents: 6_000 })
      expect(repository.written).toEqual([{ id: "e1", patch: { payments: [reversed] } }])
      expect(repository.audits).toEqual([
        { action: "update", summary: "Alterou financial-entry", changedFields: [...Object.keys(holder)] },
      ])
      expect(repository.found[0]).toEqual({ clinicId, filters: {} })
    })

    test("only changes the targeted payment", async () => {
      const second = { id: "pay2", amountCents: 100, reversedAt: null }
      const { repository, commands } = setup(entry({ payments: [payment, second] }))
      await commands.reversePayment(reverse("pay2", { reason: "Erro no caixa" }))
      expect(repository.written[0].patch.payments).toEqual([
        payment,
        { ...second, reversedAt: now, reverseReason: "Erro no caixa", reversedBy: "fin-1" },
      ])
    })

    test("finds the payment before checking the reason, then the reason before the reversal state", async () => {
      const { repository, commands } = setup(holder, entry({ id: "e2", payments: [{ id: "pay9", amountCents: 1, reversedAt: now }] }))
      await expect(commands.reversePayment(reverse("none", { reason: "x" }))).rejects.toThrow("not_found")
      await expect(commands.reversePayment(reverse("pay1", { reason: "curt" }))).rejects.toThrow("validation")
      await expect(commands.reversePayment(reverse("pay1", {}))).rejects.toThrow("validation")
      await expect(commands.reversePayment(reverse("pay9", { reason: "curt" }))).rejects.toThrow("validation")
      await expect(commands.reversePayment(reverse("pay9", { reason: "Erro no caixa" }))).rejects.toThrow("conflict")
      expect(repository.written).toEqual([])
    })

    test("does not reverse on an entry that is no longer valid", async () => {
      const { repository, commands } = setup(entry({ amountCents: 0, payments: [payment] }))
      await expect(commands.reversePayment(reverse("pay1", { reason: "Erro no caixa" }))).rejects.toThrow("validation")
      expect(repository.written).toEqual([])
    })

    test("needs an authenticated actor", async () => {
      const { commands } = setup(holder)
      await expect(commands.reversePayment(reverse("pay1", {}, { userId: "system", roles: [] }))).rejects.toThrow("unauthorized")
    })
  })
})
