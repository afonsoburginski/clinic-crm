import { describe, expect, it } from "vitest"

import { findPossibleDuplicates } from "../duplicate-detection"
import {
  abaGoalStatusSchema,
  financialEntrySchema,
  guardianSchema,
  isValidCPF,
  paymentSchema,
  professionalSchema,
  serviceSchema,
  weeklySlotSchema,
} from "../schemas"
import type { Patient } from "../types"

describe("PAC — validações", () => {
  it("CA-PAC-001 · RN-PAC-002 · CPF com dígitos iguais é inválido", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false)
    expect(isValidCPF("123")).toBe(false)
  })

  it("aceita CPF válido com ou sem máscara", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true)
    expect(isValidCPF("52998224725")).toBe(true)
  })

  it("RN-RSP-001 · responsável exige telefone", () => {
    const result = guardianSchema.safeParse({ fullName: "Ana Souza", document: "", phone: "", email: "" })
    expect(result.success).toBe(false)
  })
})

describe("PAC — duplicados", () => {
  const existing: Patient = {
    id: "pa1",
    code: "PAC-0001",
    fullName: "Maria Aparecida Souza",
    birthDate: "2015-04-10",
    document: "529.982.247-25",
    status: "active",
    consentData: true,
    consentImage: false,
    createdAt: "",
    updatedAt: "",
  }

  it("CA-PAC-002 · RN-PAC-003 · nome semelhante + mesma data de nascimento", () => {
    const matches = findPossibleDuplicates({ fullName: "maria aparecida sousa", birthDate: "2015-04-10" }, [existing])
    expect(matches).toHaveLength(1)
  })

  it("CPF igual é sempre suspeito", () => {
    const matches = findPossibleDuplicates({ fullName: "Outra Pessoa", document: "52998224725" }, [existing])
    expect(matches).toHaveLength(1)
  })

  it("ignora o próprio registro em edição", () => {
    const matches = findPossibleDuplicates({ id: "pa1", fullName: existing.fullName, birthDate: existing.birthDate }, [existing])
    expect(matches).toEqual([])
  })
})

describe("FIN — valor em reais (RN-FIN-001)", () => {
  const entry = { kind: "income", description: "Mensalidade", category: "Atendimentos", counterparty: "", patientId: "", competence: "2026-04", dueDate: "2026-04-20" }
  const payment = { paidAt: "2026-04-10", method: "pix", requestId: "r1" }
  const firstIssue = (amount: number) => {
    const result = financialEntrySchema.safeParse({ ...entry, amount })
    return result.success ? undefined : result.error.issues[0].message
  }

  it("aceita valores com até 2 casas decimais, inclusive os que o ponto flutuante distorce", () => {
    for (const amount of [0.01, 1, 19.99, 100.5, 0.1 + 0.2, 10_000_000]) {
      expect(financialEntrySchema.safeParse({ ...entry, amount }).success).toBe(true)
      expect(paymentSchema.safeParse({ ...payment, amount }).success).toBe(true)
    }
  })

  it("recusa valor que arredonda a zero ou passa de 2 casas decimais, no lançamento e no pagamento", () => {
    for (const amount of [0.004, 0.001, 0.005, 10.005, 1.234, 99.999]) {
      expect(financialEntrySchema.safeParse({ ...entry, amount }).success).toBe(false)
      expect(paymentSchema.safeParse({ ...payment, amount }).success).toBe(false)
    }
    expect(firstIssue(0.004)).toMatch(/maior que zero/)
    expect(firstIssue(1.234)).toMatch(/2 casas decimais/)
  })

  it("segue recusando zero, negativo e valor muito alto", () => {
    expect(firstIssue(0)).toMatch(/maior que zero/)
    expect(firstIssue(-1)).toMatch(/maior que zero/)
    expect(firstIssue(10_000_000.01)).toMatch(/muito alto/)
  })
})

describe("ABA — situação do objetivo (RN-ABA-006)", () => {
  it("só aceita alcançado ou descontinuado — reativar não é uma opção", () => {
    expect(abaGoalStatusSchema.safeParse({ to: "achieved", reason: "" }).success).toBe(true)
    expect(abaGoalStatusSchema.safeParse({ to: "discontinued", reason: "Motivo claro" }).success).toBe(true)
    expect(abaGoalStatusSchema.safeParse({ to: "active", reason: "" }).success).toBe(false)
  })
})

describe("PRO / CAT — validações", () => {
  it("RN-PRO-001 · exige ao menos uma especialidade", () => {
    const result = professionalSchema.safeParse({ name: "Helena", email: "h@h.com", phone: "", registry: "", specialtyIds: [], active: true })
    expect(result.success).toBe(false)
  })

  it("RN-PRO-002 · término da faixa deve ser após o início", () => {
    expect(weeklySlotSchema.safeParse({ weekday: 1, start: "10:00", end: "09:00" }).success).toBe(false)
  })

  it("RN-CAT-001 · duração entre 10 e 480 minutos", () => {
    const base = { name: "Sessão", specialtyId: "sp", referencePrice: 100, requiresRoom: false, active: true }
    expect(serviceSchema.safeParse({ ...base, durationMin: 5 }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...base, durationMin: 50 }).success).toBe(true)
  })
})
