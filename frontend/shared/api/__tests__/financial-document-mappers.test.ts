import { describe, expect, it } from "vitest"

import { toDocumentRelease, toPatientDocument } from "../document-mappers"
import { entryCodeOf, toFinancialEntry, toFinancialPayments } from "../financial-mappers"

const nameOf = (id?: string) => (id === "u-fin" ? "Rita Souza" : "Usuário da clínica")

describe("financeiro", () => {
  const row = {
    id: "3f2a1b99-0000-4000-8000-000000000000",
    type: "expense",
    description: "Aluguel da sala",
    category: "Infraestrutura",
    counterparty: null,
    patientId: null,
    competence: "2026-03",
    dueDate: "2026-03-10",
    amountCents: 120000,
    status: "partial",
    createdBy: "u-fin",
    createdAt: "2026-03-01T10:00:00.000Z",
    payments: [
      { id: "pay1", amountCents: 50000, paidAt: "2026-03-05", method: "pix", requestId: "rq1", reversedAt: null, createdBy: "u-fin" },
      { id: "pay2", amountCents: 20000, paidAt: "2026-03-06", method: "desconhecido", requestId: "rq2", reversedAt: "2026-03-07T10:00:00.000Z", reverseReason: "Valor errado", reversedBy: "u-fin", createdBy: "u-fin" },
    ],
  }

  it("lê `type` como kind e gera o código a partir do id", () => {
    const entry = toFinancialEntry(row)
    expect(entry).toMatchObject({ kind: "expense", code: "LAN-3F2A1B", counterparty: undefined, patientId: undefined, amountCents: 120000, updatedAt: row.createdAt })
    expect(toFinancialEntry({ ...row, kind: "income", type: "expense" }).kind).toBe("income")
    expect(entryCodeOf("abcdef123")).toBe("LAN-ABCDEF")
  })

  it("pagamentos pertencem ao lançamento; estornos e forma desconhecida são tratados", () => {
    const payments = toFinancialPayments(row, nameOf)
    expect(payments.map((p) => [p.entryId, p.method, p.reversedAt ? "estornado" : "ativo"])).toEqual([
      [row.id, "pix", "ativo"],
      [row.id, "other", "estornado"],
    ])
    expect(payments[0]).toMatchObject({ registeredBy: "u-fin", registeredByName: "Rita Souza", createdAt: "2026-03-05" })
    expect(payments[1]).toMatchObject({ reverseReason: "Valor errado", reversedBy: "u-fin" })
  })

  it("cancelamento traz data e motivo", () => {
    expect(toFinancialEntry({ ...row, status: "cancelled", cancelledAt: "2026-03-09T10:00:00.000Z", cancelReason: "Contrato rescindido" })).toMatchObject({
      cancelledAt: "2026-03-09T10:00:00.000Z",
      cancelReason: "Contrato rescindido",
    })
  })
})

describe("documentos", () => {
  const row = {
    id: "d1",
    patientId: "p1",
    title: "Declaração",
    type: "Declaração",
    classification: "clinical",
    status: "issued",
    clinicalRecordId: "r1",
    notes: null,
    createdBy: "u-ana",
    createdByName: "Ana Prado",
    createdAt: "2026-03-01T10:00:00.000Z",
    issuedAt: "2026-03-02T10:00:00.000Z",
    releases: [
      { id: "rl1", guardianId: "g1", active: true, createdBy: "u-ana", createdAt: "2026-03-03T10:00:00.000Z" },
      { id: "rl2", guardianId: "g2", active: false, createdBy: "u-ana", createdAt: "2026-03-03T11:00:00.000Z", revokedAt: "2026-03-04T10:00:00.000Z", revokedBy: "u-ana", reason: "Pedido da família" },
    ],
  }

  it("traduz documento e liberações (ativa e revogada)", () => {
    const doc = toPatientDocument(row, nameOf)
    expect(doc).toMatchObject({ classification: "clinical", status: "issued", clinicalRecordId: "r1", notes: undefined, createdByName: "Ana Prado", issuedAt: row.issuedAt, updatedAt: row.createdAt })
    expect(doc.releases[0]).toMatchObject({ releasedAt: "2026-03-03T10:00:00.000Z", releasedBy: "u-ana", releasedByName: "Usuário da clínica", revokedAt: undefined })
    expect(doc.releases[1]).toMatchObject({ revokedAt: "2026-03-04T10:00:00.000Z", revokeReason: "Pedido da família" })
  })

  it("arquivamento revoga com `revokeReason`, e só documento clínico guarda vínculo ao prontuário", () => {
    expect(toDocumentRelease({ id: "x", guardianId: "g", active: false, revokedAt: "2026-03-05T10:00:00.000Z", revokeReason: "Documento arquivado" }).revokeReason).toBe("Documento arquivado")
    expect(toPatientDocument({ ...row, classification: "financial" }, nameOf).clinicalRecordId).toBeUndefined()
    expect(toPatientDocument({ id: "z" }, nameOf)).toMatchObject({ classification: "administrative", status: "draft", releases: [] })
  })
})
