import { describe, expect, it } from "vitest"

import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors"

import { api } from "../api"
import { callsTo, calls, denied, installFakeApi, routes, signInAs } from "./support/fake-api"

// Adaptadores de financeiro e documentos contra a API Hono simulada.
installFakeApi()

const entryRow = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  type: "income",
  description: "Sessão de psicologia",
  category: "Consulta",
  competence: "2025-03",
  dueDate: "2099-03-10",
  amountCents: 10000,
  status: "open",
  createdBy: "u1",
  createdAt: "2025-03-01T10:00:00.000Z",
  payments: [],
  ...over,
})
const paymentRow = (over: Record<string, unknown> = {}) => ({ id: "pay1", amountCents: 4000, paidAt: "2025-03-05", method: "pix", requestId: "rq1", reversedAt: null, createdBy: "u1", ...over })

describe("financeiro", () => {
  it("list deriva a situação dos pagamentos e filtra no cliente (a API só devolve os lançamentos)", async () => {
    signInAs(["finance"])
    routes["GET /financial/entries"] = {
      items: [
        entryRow(),
        entryRow({ id: "e2", dueDate: "2025-03-10", description: "Aluguel", type: "expense", category: "Infra" }),
        entryRow({ id: "e3", payments: [paymentRow({ amountCents: 10000 })] }),
        entryRow({ id: "e4", status: "cancelled", cancelledAt: "2025-03-02T10:00:00.000Z", cancelReason: "Duplicado" }),
      ],
    }
    const all = await api.financial.list()
    expect(all.map((r) => [r.entry.id, r.status])).toEqual([["e2", "overdue"], ["e1", "open"], ["e3", "paid"], ["e4", "cancelled"]])
    expect((await api.financial.list({ status: "overdue" })).map((r) => r.entry.id)).toEqual(["e2"])
    expect((await api.financial.list({ kind: "expense" })).map((r) => r.entry.id)).toEqual(["e2"])
    expect((await api.financial.list({ search: "aluguel" })).map((r) => r.entry.id)).toEqual(["e2"])
    expect((await api.financial.list({ competence: "2025-04" }))).toEqual([])
  })

  it("perfil sem finance:read recebe acesso negado", async () => {
    signInAs(["reception"])
    routes["GET /financial/entries"] = denied
    await expect(api.financial.list()).rejects.toThrow(ForbiddenError)
  })

  it("summary resume só dados reais da competência", async () => {
    signInAs(["finance"])
    routes["GET /financial/entries"] = { items: [entryRow({ payments: [paymentRow()] }), entryRow({ id: "e2", type: "expense", amountCents: 3000, competence: "2025-04" })] }
    const summary = await api.financial.summary("2025-03")
    expect(summary.income).toMatchObject({ count: 1, expectedCents: 10000, settledCents: 4000, openCents: 6000 })
    expect(summary.expense.count).toBe(0)
    expect(summary.realizedResultCents).toBe(4000)
  })

  it("get traz os pagamentos do mais novo ao mais antigo", async () => {
    signInAs(["finance"])
    routes["GET /financial/entries/e1"] = entryRow({ payments: [paymentRow(), paymentRow({ id: "pay2", requestId: "rq2", amountCents: 1000, paidAt: "2025-03-06" })] })
    const detail = await api.financial.get("e1")
    expect(detail.payments.map((p) => p.id)).toEqual(["pay2", "pay1"])
    expect(detail).toMatchObject({ paidCents: 5000, balanceCents: 5000, status: "partial" })
    routes["GET /financial/entries/nao"] = { __reply: 404, body: { error: { code: "not_found", message: "not_found" } } }
    await expect(api.financial.get("nao")).rejects.toThrow(NotFoundError)
  })

  it("create grava centavos exatos e envia `type` (a API soma por ele) junto de `kind`", async () => {
    signInAs(["finance"])
    routes["POST /financial/entries"] = (call: { body: Record<string, unknown> }) => ({ id: "e9", createdBy: "u1", ...call.body })
    const created = await api.financial.create({ kind: "income", description: "Sessão", category: "Consulta", counterparty: "", patientId: "", competence: "2025-03", dueDate: "2025-03-10", amount: 19.99 })
    expect(callsTo("POST /financial/entries")[0].body).toMatchObject({ kind: "income", type: "income", amountCents: 1999, status: "open", counterparty: null, patientId: null })
    expect(created).toMatchObject({ id: "e9", code: "LAN-E9", amountCents: 1999 })
  })

  it("valor com mais de 2 casas ou que arredonda a zero é recusado sem chamar a API (CA-FIN-005)", async () => {
    signInAs(["finance"])
    const base = { kind: "income" as const, description: "Sessão", category: "Consulta", counterparty: "", patientId: "", competence: "2025-03", dueDate: "2025-03-10" }
    await expect(api.financial.create({ ...base, amount: 0.004 })).rejects.toThrow(ValidationError)
    await expect(api.financial.create({ ...base, amount: 10.005 })).rejects.toThrow(ValidationError)
    expect(calls).toHaveLength(0)
  })

  it("paciente inexistente é recusado quando a lista de pacientes está acessível", async () => {
    signInAs(["finance"])
    routes["GET /patients"] = { items: [] }
    await expect(
      api.financial.create({ kind: "income", description: "Sessão", category: "Consulta", counterparty: "", patientId: "p-x", competence: "2025-03", dueDate: "2025-03-10", amount: 10 })
    ).rejects.toThrow(/Paciente não encontrado/)
    expect(callsTo("POST /financial/entries")).toHaveLength(0)
  })

  it("não altera o valor abaixo do já pago nem o tipo (RN-FIN-008)", async () => {
    signInAs(["finance"])
    routes["GET /financial/entries/e1"] = entryRow({ payments: [paymentRow()] })
    const base = { kind: "income" as const, description: "Sessão", category: "Consulta", counterparty: "", patientId: "", competence: "2025-03", dueDate: "2099-03-10" }
    await expect(api.financial.update("e1", { ...base, amount: 30 })).rejects.toThrow(/abaixo do total já pago/)
    await expect(api.financial.update("e1", { ...base, kind: "expense", amount: 100 })).rejects.toThrow(/tipo/)
    expect(callsTo("PATCH /financial/entries/e1")).toHaveLength(0)

    routes["PATCH /financial/entries/e1"] = (call: { body: Record<string, unknown> }) => entryRow(call.body)
    const saved = await api.financial.update("e1", { ...base, amount: 150.5 })
    expect(callsTo("PATCH /financial/entries/e1")[0].body).toMatchObject({ amountCents: 15050 })
    expect(callsTo("PATCH /financial/entries/e1")[0].body).not.toHaveProperty("payments")
    expect(saved.amountCents).toBe(15050)
  })

  it("aceita parcelas, recusa excesso e dupla baixa, e é idempotente por requestId (CA-FIN-001/002)", async () => {
    signInAs(["finance"])
    routes["GET /financial/entries/e1"] = entryRow({ payments: [paymentRow()] })
    routes["POST /financial/entries/e1/payments"] = (call: { body: Record<string, unknown> }) => ({ id: "pay9", reversedAt: null, createdBy: "u1", ...call.body })

    await expect(api.financial.registerPayment("e1", { amount: 70, paidAt: "2025-03-06", method: "pix", requestId: "rq2" })).rejects.toThrow(ValidationError)
    expect(callsTo("POST /financial/entries/e1/payments")).toHaveLength(0)

    const paid = await api.financial.registerPayment("e1", { amount: 60, paidAt: "2025-03-06", method: "card", requestId: "rq2" })
    expect(callsTo("POST /financial/entries/e1/payments")[0].body).toEqual({ requestId: "rq2", amountCents: 6000, paidAt: "2025-03-06", method: "card" })
    expect(paid).toMatchObject({ id: "pay9", entryId: "e1", amountCents: 6000, method: "card" })

    const repeated = await api.financial.registerPayment("e1", { amount: 40, paidAt: "2025-03-05", method: "pix", requestId: "rq1" })
    expect(repeated.id).toBe("pay1")
    expect(callsTo("POST /financial/entries/e1/payments")).toHaveLength(1)

    routes["GET /financial/entries/e1"] = entryRow({ payments: [paymentRow({ amountCents: 10000 })] })
    await expect(api.financial.registerPayment("e1", { amount: 1, paidAt: "2025-03-06", method: "pix", requestId: "rq3" })).rejects.toThrow(ValidationError)
  })

  it("pagamento com data futura é recusado", async () => {
    signInAs(["finance"])
    routes["GET /financial/entries/e1"] = entryRow()
    await expect(api.financial.registerPayment("e1", { amount: 10, paidAt: "2099-01-01", method: "pix", requestId: "rq9" })).rejects.toThrow(/futura/)
    expect(callsTo("POST /financial/entries/e1/payments")).toHaveLength(0)
  })

  it("não cancela com pagamento ativo; cancela sem apagar e estorna com motivo (CA-FIN-003)", async () => {
    signInAs(["finance"])
    routes["GET /financial/entries/e1"] = entryRow({ payments: [paymentRow()] })
    await expect(api.financial.cancel("e1", { reason: "Lançado em duplicidade" })).rejects.toThrow(ValidationError)
    expect(callsTo("POST /financial/entries/e1/cancel")).toHaveLength(0)

    routes["GET /financial/entries/e2"] = entryRow({ id: "e2" })
    routes["POST /financial/entries/e2/cancel"] = entryRow({ id: "e2", status: "cancelled" })
    await api.financial.cancel("e2", { reason: "Lançado em duplicidade" })
    expect(callsTo("POST /financial/entries/e2/cancel")[0].body).toEqual({ reason: "Lançado em duplicidade" })

    routes["POST /financial/payments/pay1/reverse"] = entryRow()
    await expect(api.financial.reversePayment("pay1", { reason: "ruim" })).rejects.toThrow(ValidationError)
    await api.financial.reversePayment("pay1", { reason: "Valor lançado errado" })
    expect(callsTo("POST /financial/payments/pay1/reverse")[0].body).toEqual({ reason: "Valor lançado errado" })
  })

  it("administração só lê: a escrita volta 403 da API", async () => {
    signInAs(["admin"])
    routes["GET /financial/entries/e1"] = entryRow()
    routes["POST /financial/entries/e1/cancel"] = denied
    await expect(api.financial.cancel("e1", { reason: "Lançado em duplicidade" })).rejects.toThrow(ForbiddenError)
  })
})

const docRow = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  patientId: "p1",
  title: "Contrato de serviços",
  type: "Contrato",
  classification: "administrative",
  status: "draft",
  releases: [],
  createdBy: "u1",
  createdByName: "Marina Alves",
  createdAt: "2026-03-01T10:00:00.000Z",
  ...over,
})
const patientRow = { id: "p1", code: "1", fullName: "Ana Souza", birthDate: "2019-05-10T00:00:00.000Z", status: "active" }
const docInput = { patientId: "p1", title: "Contrato de serviços", type: "Contrato", classification: "administrative" as const, clinicalRecordId: "", notes: "" }

describe("documentos", () => {
  it("list junta o nome do paciente, filtra a classificação e marca o que o perfil pode escrever", async () => {
    signInAs(["reception"])
    routes["GET /patients"] = { items: [patientRow] }
    routes["GET /documents"] = (call: { search: URLSearchParams }) => {
      expect(call.search.get("status")).toBe("draft")
      return { items: [docRow(), docRow({ id: "d2", classification: "financial", createdAt: "2026-03-02T10:00:00.000Z" })] }
    }
    const rows = await api.documents.list({ status: "draft" })
    expect(rows.map((r) => [r.doc.id, r.patientName, r.canWrite])).toEqual([["d2", "Ana Souza", false], ["d1", "Ana Souza", true]])
    expect((await api.documents.list({ status: "draft", classification: "administrative" })).map((r) => r.doc.id)).toEqual(["d1"])
  })

  it("perfil sem acesso recebe mensagem de documentos", async () => {
    signInAs(["manager"])
    routes["GET /documents"] = denied
    await expect(api.documents.list()).rejects.toThrow(/acesso a documentos/)
  })

  it("get traz nomes de responsáveis, mesmo após o desvínculo, e se o perfil escreve", async () => {
    signInAs(["reception"])
    routes["GET /documents/d1"] = docRow({ status: "issued", releases: [{ id: "rl1", guardianId: "g1", active: true, createdBy: "u1", createdAt: "2026-03-03T10:00:00.000Z" }, { id: "rl2", guardianId: "g-removido", active: true, createdBy: "u1", createdAt: "2026-03-03T10:00:00.000Z" }] })
    routes["GET /patients"] = { items: [patientRow] }
    routes["GET /guardians"] = { items: [{ id: "g1", full_name: "Maria Souza", phone: "11999990000" }] }
    const detail = await api.documents.get("d1")
    expect(detail).toMatchObject({ patientName: "Ana Souza", canWrite: true, guardianNames: { g1: "Maria Souza", "g-removido": "Responsável" } })
  })

  it("perfil sem acesso à classificação não lê o documento (CA-DOC-003)", async () => {
    signInAs(["reception"])
    routes["GET /documents/d1"] = denied
    await expect(api.documents.get("d1")).rejects.toThrow(/não tem acesso a este documento/)
  })

  it("create valida a classificação pelo perfil antes da chamada e envia o autor", async () => {
    signInAs(["finance"])
    routes["GET /patients"] = { items: [patientRow] }
    await expect(api.documents.create(docInput)).rejects.toThrow(ForbiddenError)
    expect(callsTo("POST /documents")).toHaveLength(0)

    signInAs(["reception"])
    routes["POST /documents"] = (call: { body: Record<string, unknown> }) => ({ id: "d9", createdBy: "u1", ...call.body })
    const created = await api.documents.create(docInput)
    expect(callsTo("POST /documents")[0].body).toMatchObject({ patientId: "p1", classification: "administrative", createdByName: "Marina Alves" })
    expect(callsTo("POST /documents")[0].body).not.toHaveProperty("clinicalRecordId")
    expect(created).toMatchObject({ id: "d9", status: "draft" })
    await expect(api.documents.create({ ...docInput, clinicalRecordId: "r1" })).rejects.toThrow(/Somente documentos clínicos/)
  })

  it("documento clínico referencia o prontuário e só o autor do registro cria (RN-DOC-002/008)", async () => {
    signInAs(["professional"], { professionalId: "pr1" })
    routes["GET /patients"] = { items: [patientRow] }
    const clinical = { ...docInput, classification: "clinical" as const, clinicalRecordId: "r1" }
    await expect(api.documents.create({ ...clinical, clinicalRecordId: "" })).rejects.toThrow(/Vincule um documento clínico/)

    routes["GET /clinical-records/r1"] = { id: "r1", patientId: "p1", type: "clinical_document", title: "Laudo", status: "finalized", createdBy: "outro", createdAt: "2026-03-01T10:00:00.000Z" }
    await expect(api.documents.create(clinical)).rejects.toThrow(/Somente o autor/)

    routes["GET /clinical-records/r1"] = { id: "r1", patientId: "p1", type: "clinical_document", title: "Laudo", status: "finalized", createdBy: "u1", createdAt: "2026-03-01T10:00:00.000Z" }
    routes["POST /documents"] = (call: { body: Record<string, unknown> }) => ({ id: "d9", createdBy: "u1", ...call.body })
    expect(await api.documents.create(clinical)).toMatchObject({ classification: "clinical", clinicalRecordId: "r1" })
  })

  it("só edita rascunho e não muda classificação", async () => {
    signInAs(["reception"])
    routes["GET /patients"] = { items: [patientRow] }
    routes["GET /documents/d1"] = docRow({ status: "issued" })
    await expect(api.documents.update("d1", docInput)).rejects.toThrow(/rascunho/)

    routes["GET /documents/d1"] = docRow()
    routes["PATCH /documents/d1"] = (call: { body: Record<string, unknown> }) => docRow(call.body)
    await api.documents.update("d1", { ...docInput, classification: "financial", title: "Contrato novo" })
    expect(callsTo("PATCH /documents/d1")[0].body).toMatchObject({ classification: "administrative", patientId: "p1", title: "Contrato novo" })
  })

  it("emitir carimba a data e muda a situação; transição inválida não chega à API", async () => {
    signInAs(["reception"])
    routes["GET /patients"] = { items: [patientRow] }
    routes["GET /documents/d1"] = docRow()
    routes["PATCH /documents/d1"] = docRow()
    routes["POST /documents/d1/status"] = docRow({ status: "issued", issuedAt: "2026-03-02T10:00:00.000Z" })
    const issued = await api.documents.setStatus("d1", "issued")
    expect(calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`)).toEqual(["PATCH /documents/d1", "POST /documents/d1/status"])
    expect(callsTo("PATCH /documents/d1")[0].body.issuedAt).toEqual(expect.any(String))
    expect(callsTo("POST /documents/d1/status")[0].body).toEqual({ status: "issued" })
    expect(issued.status).toBe("issued")

    routes["GET /documents/d1"] = docRow({ status: "archived" })
    await expect(api.documents.setStatus("d1", "issued")).rejects.toThrow(/Não é possível mudar/)
    expect(callsTo("POST /documents/d1/status")).toHaveLength(1)
  })

  it("documento clínico só é emitido com o registro vinculado finalizado (RN-DOC-003)", async () => {
    signInAs(["professional"], { professionalId: "pr1" })
    routes["GET /patients"] = { items: [patientRow] }
    routes["GET /documents/d1"] = docRow({ classification: "clinical", clinicalRecordId: "r1" })
    routes["GET /clinical-records/r1/versions"] = { items: [{ id: "r1", patientId: "p1", type: "clinical_document", status: "draft", createdBy: "u1", version: 1 }] }
    await expect(api.documents.setStatus("d1", "issued")).rejects.toThrow(/finalizado/)
    expect(callsTo("POST /documents/d1/status")).toHaveLength(0)
  })

  it("liberação é explícita, só para responsável autorizado e documento emitido (CA-DOC-001/002/004)", async () => {
    signInAs(["reception"])
    routes["GET /patients"] = { items: [patientRow] }
    routes["GET /documents/d1"] = docRow()
    routes["GET /patient-guardians"] = { items: [{ id: "l1", patient_id: "p1", guardian_id: "g1", relationship: "Mãe", can_receive_documents: true }, { id: "l2", patient_id: "p1", guardian_id: "g2", relationship: "Pai", can_receive_documents: false }] }
    await expect(api.documents.release("d1", { guardianId: "g1" })).rejects.toThrow(/emitidos/)

    routes["GET /documents/d1"] = docRow({ status: "issued" })
    await expect(api.documents.release("d1", { guardianId: "g2" })).rejects.toThrow(/não está autorizado/)
    await expect(api.documents.release("d1", { guardianId: "g3" })).rejects.toThrow(/não está vinculado/)
    expect(callsTo("POST /documents/d1/releases")).toHaveLength(0)

    routes["POST /documents/d1/releases"] = docRow({ status: "issued", releases: [{ id: "rl1", guardianId: "g1", active: true, createdBy: "u1", createdAt: "2026-03-03T10:00:00.000Z" }] })
    const release = await api.documents.release("d1", { guardianId: "g1" })
    expect(callsTo("POST /documents/d1/releases")[0].body).toEqual({ guardianId: "g1" })
    expect(release).toMatchObject({ id: "rl1", guardianId: "g1", releasedByName: "Marina Alves" })
  })

  it("revogar exige liberação ativa e motivo", async () => {
    signInAs(["reception"])
    routes["GET /patients"] = { items: [patientRow] }
    routes["GET /documents/d1"] = docRow({ status: "issued", releases: [{ id: "rl1", guardianId: "g1", active: true, createdBy: "u1", createdAt: "2026-03-03T10:00:00.000Z" }, { id: "rl2", guardianId: "g2", active: false, createdAt: "2026-03-03T10:00:00.000Z", revokedAt: "2026-03-04T10:00:00.000Z" }] })
    routes["POST /documents/d1/releases/rl1/revoke"] = docRow()
    await expect(api.documents.revokeRelease("d1", "rl1", { reason: "ok" })).rejects.toThrow(ValidationError)
    await expect(api.documents.revokeRelease("d1", "rl2", { reason: "Pedido da família" })).rejects.toThrow(/já foi revogada/)
    await expect(api.documents.revokeRelease("d1", "rl9", { reason: "Pedido da família" })).rejects.toThrow(/não encontrada/)
    await api.documents.revokeRelease("d1", "rl1", { reason: "Pedido da família" })
    expect(callsTo("POST /documents/d1/releases/rl1/revoke")[0].body).toEqual({ reason: "Pedido da família" })
  })
})
