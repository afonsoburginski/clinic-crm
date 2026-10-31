import { describe, expect, it } from "bun:test"
import {
  financialStatus,
  validateCancellation,
  validatePayment,
  validateReversal,
} from "@/domain/financial"

const entry = {
  amountCents: 10_000,
  dueDate: "2026-10-31",
  payments: [{ amountCents: 4_000 }],
}

describe("financial domain", () => {
  it("derives overdue ahead of partial", () => {
    expect(financialStatus(entry, "2026-11-01")).toBe("overdue")
  })

  it("allows partial payments only up to the outstanding balance", () => {
    expect(() => validatePayment(entry, 6_000, "2026-10-31", "2026-10-31"))
      .not.toThrow()
    expect(() => validatePayment(entry, 6_001, "2026-10-31", "2026-10-31"))
      .toThrow("validation")
  })

  it("blocks cancellation while an active payment exists", () => {
    expect(() => validateCancellation(entry, "Pedido válido")).toThrow("conflict")
  })

  it("allows one reversal with a reason", () => {
    expect(() => validateReversal({ amountCents: 100 }, "Erro no caixa"))
      .not.toThrow()
    expect(() => validateReversal(
      { amountCents: 100, reversedAt: "2026-10-31" },
      "Erro no caixa",
    )).toThrow("conflict")
  })
})
