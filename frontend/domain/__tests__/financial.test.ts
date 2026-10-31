import { describe, expect, it } from "vitest"

import {
  amountToCents,
  balanceCents,
  entryStatus,
  hasCentPrecision,
  paidCents,
  summarize,
  validateCancellation,
  validateEntryAmount,
  validateEntryUpdate,
  validatePayment,
  validateReversal,
} from "../financial"
import { permissionsFor } from "../permissions"
import type { FinancialEntry, FinancialPayment, Role } from "../types"

const TODAY = "2026-04-15"

const entry = (over: Partial<FinancialEntry> = {}): FinancialEntry => ({
  id: "e1",
  code: "LAN-0001",
  kind: "income",
  description: "Mensalidade",
  category: "Atendimentos",
  competence: "2026-04",
  dueDate: "2026-04-20",
  amountCents: 10000,
  createdBy: "u",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  ...over,
})

let seq = 0
const pay = (amountCents: number, over: Partial<FinancialPayment> = {}): FinancialPayment => ({
  id: `p${++seq}`,
  entryId: "e1",
  amountCents,
  paidAt: "2026-04-10",
  method: "pix",
  requestId: `r${seq}`,
  registeredBy: "u",
  registeredByName: "Otávio",
  createdAt: "2026-04-10T00:00:00.000Z",
  ...over,
})

describe("FIN — centavos (RN-FIN-001)", () => {
  it("converte reais em centavos exatos, mesmo onde o ponto flutuante distorce", () => {
    expect(amountToCents(19.99)).toBe(1999)
    expect(amountToCents(0.01)).toBe(1)
    expect(amountToCents(0.1 + 0.2)).toBe(30)
    expect(amountToCents(1.005 * 1000)).toBe(100500)
    expect(amountToCents(10_000_000)).toBe(1_000_000_000)
  })

  it.each([0.004, 0.001, 0.0049, 0, -1, -0.01, Number.NaN, Number.POSITIVE_INFINITY])("recusa %s: arredonda a zero, é negativo ou não é número", (amount) => {
    expect(() => amountToCents(amount)).toThrow(/maior que zero/)
  })

  it.each([0.005, 0.006, 1.234, 10.005, 99.999, 0.30010000000000003])("recusa %s: mais de 2 casas decimais, sem arredondar", (amount) => {
    expect(() => amountToCents(amount)).toThrow(/2 casas decimais/)
    expect(hasCentPrecision(amount)).toBe(false)
  })

  it("hasCentPrecision aceita até 2 casas", () => {
    for (const amount of [1, 1.5, 19.99, 0.1 + 0.2, 1234567.89]) expect(hasCentPrecision(amount)).toBe(true)
  })

  it("a regra de domínio exige centavos inteiros e positivos, sem depender do schema", () => {
    expect(() => validateEntryAmount(1)).not.toThrow()
    for (const cents of [0, -5, 10.5, Number.NaN]) expect(() => validateEntryAmount(cents)).toThrow(/maior que zero/)
    expect(() => validateEntryUpdate(entry(), [], { kind: "income", amountCents: 0 })).toThrow(/maior que zero/)
    expect(() => validateEntryUpdate(entry(), [], { kind: "income", amountCents: 100.5 })).toThrow(/maior que zero/)
    expect(() => validateEntryUpdate(entry(), [], { kind: "income", amountCents: 1 })).not.toThrow()
  })
})

describe("FIN — situação (RN-FIN-002)", () => {
  it("deriva aberto, parcial, pago, vencido e cancelado", () => {
    expect(entryStatus(entry(), [], TODAY)).toBe("open")
    expect(entryStatus(entry(), [pay(4000)], TODAY)).toBe("partial")
    expect(entryStatus(entry(), [pay(4000), pay(6000)], TODAY)).toBe("paid")
    expect(entryStatus(entry({ dueDate: "2026-04-01" }), [pay(4000)], TODAY)).toBe("overdue")
    expect(entryStatus(entry({ dueDate: "2026-04-01" }), [pay(10000)], TODAY)).toBe("paid")
    expect(entryStatus(entry({ cancelledAt: "2026-04-02T00:00:00.000Z" }), [], TODAY)).toBe("cancelled")
  })

  it("pagamento estornado não conta no saldo (RN-FIN-007)", () => {
    const payments = [pay(10000, { reversedAt: "2026-04-11T00:00:00.000Z" })]
    expect(paidCents(payments)).toBe(0)
    expect(balanceCents(entry(), payments)).toBe(10000)
    expect(entryStatus(entry(), payments, TODAY)).toBe("open")
  })
})

describe("FIN — pagamentos parciais e dupla baixa (RN-FIN-003/004/005)", () => {
  it("permite parcelas até quitar e depois recusa nova baixa (CA-FIN-001)", () => {
    const first = pay(4000)
    expect(() => validatePayment(entry(), [], { amountCents: 4000, paidAt: "2026-04-10" }, TODAY)).not.toThrow()
    expect(() => validatePayment(entry(), [first], { amountCents: 6000, paidAt: "2026-04-10" }, TODAY)).not.toThrow()
    const all = [first, pay(6000)]
    expect(() => validatePayment(entry(), all, { amountCents: 100, paidAt: "2026-04-10" }, TODAY)).toThrow(/quitado/)
  })

  it("recusa valor acima do saldo (CA-FIN-002)", () => {
    expect(() => validatePayment(entry(), [pay(4000)], { amountCents: 7000, paidAt: "2026-04-10" }, TODAY)).toThrow(/excede o saldo/)
  })

  it("recusa valor inválido, data futura e lançamento cancelado", () => {
    expect(() => validatePayment(entry(), [], { amountCents: 0, paidAt: "2026-04-10" }, TODAY)).toThrow(/maior que zero/)
    expect(() => validatePayment(entry(), [], { amountCents: 10.5, paidAt: "2026-04-10" }, TODAY)).toThrow(/maior que zero/)
    expect(() => validatePayment(entry(), [], { amountCents: 100, paidAt: "2026-05-01" }, TODAY)).toThrow(/futura/)
    expect(() => validatePayment(entry({ cancelledAt: "x" }), [], { amountCents: 100, paidAt: "2026-04-10" }, TODAY)).toThrow(/cancelado/)
  })

  it("após estorno, o saldo volta e permite nova baixa", () => {
    const payments = [pay(10000, { reversedAt: "2026-04-11T00:00:00.000Z" })]
    expect(() => validatePayment(entry(), payments, { amountCents: 10000, paidAt: "2026-04-12" }, TODAY)).not.toThrow()
  })
})

describe("FIN — cancelamento e estorno sem destruição (RN-FIN-006/007/008)", () => {
  it("não cancela com pagamento ativo (CA-FIN-003)", () => {
    expect(() => validateCancellation(entry(), [pay(100)], "Lançado em duplicidade")).toThrow(/Estorne/)
  })

  it("cancela sem pagamentos ativos, exigindo motivo", () => {
    expect(() => validateCancellation(entry(), [], "x")).toThrow(/motivo/)
    expect(() => validateCancellation(entry(), [pay(100, { reversedAt: "x" })], "Lançado em duplicidade")).not.toThrow()
    expect(() => validateCancellation(entry({ cancelledAt: "x" }), [], "Lançado em duplicidade")).toThrow(/já cancelado/)
  })

  it("estorno exige motivo e ocorre uma vez", () => {
    const p = pay(100)
    expect(() => validateReversal(entry(), p, "x")).toThrow(/motivo/)
    expect(() => validateReversal(entry(), p, "Pix devolvido")).not.toThrow()
    expect(() => validateReversal(entry(), { ...p, reversedAt: "x" }, "Pix devolvido")).toThrow(/já foi estornado/)
  })

  it("valor não pode ficar abaixo do já pago e tipo não muda", () => {
    expect(() => validateEntryUpdate(entry(), [pay(6000)], { kind: "income", amountCents: 5000 })).toThrow(/abaixo/)
    expect(() => validateEntryUpdate(entry(), [pay(6000)], { kind: "income", amountCents: 6000 })).not.toThrow()
    expect(() => validateEntryUpdate(entry(), [], { kind: "expense", amountCents: 10000 })).toThrow(/tipo/)
  })
})

describe("FIN — resumo por competência (RF-FIN-003)", () => {
  it("sem lançamentos, tudo zero (nada fabricado)", () => {
    const s = summarize([], [], "2026-04", TODAY)
    expect(s.income).toEqual({ count: 0, expectedCents: 0, settledCents: 0, openCents: 0, overdueCents: 0 })
    expect(s.realizedResultCents).toBe(0)
  })

  it("soma apenas a competência pedida, ignora cancelados e estornados", () => {
    const entries = [
      entry({ id: "e1", amountCents: 10000 }),
      entry({ id: "e2", amountCents: 5000, dueDate: "2026-04-01" }),
      entry({ id: "e3", amountCents: 7000, cancelledAt: "x" }),
      entry({ id: "e4", amountCents: 9000, competence: "2026-05" }),
      entry({ id: "e5", kind: "expense", amountCents: 3000 }),
    ]
    const payments = [
      pay(4000, { entryId: "e1" }),
      pay(1000, { entryId: "e2", reversedAt: "x" }),
      pay(3000, { entryId: "e5" }),
    ]
    const s = summarize(entries, payments, "2026-04", TODAY)
    expect(s.income).toEqual({ count: 2, expectedCents: 15000, settledCents: 4000, openCents: 11000, overdueCents: 5000 })
    expect(s.expense).toMatchObject({ count: 1, settledCents: 3000, openCents: 0 })
    expect(s.realizedResultCents).toBe(1000)
  })
})

describe("FIN — permissões (RN-FIN-010, CA-FIN-004)", () => {
  const has = (role: Role, p: Parameters<ReturnType<typeof permissionsFor>["has"]>[0]) => permissionsFor([role]).has(p)

  it("só o financeiro escreve; administrador apenas lê", () => {
    expect(has("finance", "finance:write")).toBe(true)
    expect(has("admin", "finance:read")).toBe(true)
    expect(has("admin", "finance:write")).toBe(false)
  })

  it("recepção, profissional e gestor não acessam o financeiro", () => {
    for (const role of ["reception", "professional", "manager"] as Role[]) {
      expect(has(role, "finance:read")).toBe(false)
      expect(has(role, "finance:write")).toBe(false)
    }
  })
})
