import { addDays, startOfWeek } from "date-fns"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { clinicDateKey, clinicDateTimeToISO, nowInClinic } from "@/domain/clinic-time"
import { activeReleases } from "@/domain/documents"
import { ForbiddenError } from "@/domain/errors"
import type { AbaGoalStatusInput, AppointmentInput, ClinicalRecordInput } from "@/domain/schemas"
import type { Appointment, AppointmentStatus, AuditEntry } from "@/domain/types"
import { getDB, resetDB } from "@/shared/lib/demo-db"
import { useSessionStore } from "@/shared/lib/session-store"
import { emptyModules, withModuleDefaults, type DemoDB } from "@/shared/lib/demo-seed"

import { api } from "../demo-api"
import { actor, canReadPatient, now, ownPatientIds, redactClinicalAudit } from "../demo-context"
import { revokeGuardianReleases } from "../demo-documents"

// Sem latência simulada e sem persistência: o teste exercita só as regras do adaptador.
vi.mock("@/shared/lib/demo-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/demo-db")>()),
  simulateLatency: () => Promise.resolve(),
}))
vi.mock("@/shared/lib/session-store", () => {
  const state = { userId: null as string | null }
  return { useSessionStore: { getState: () => state, setState: (next: Partial<typeof state>) => Object.assign(state, next) } }
})

const login = (userId: string) => useSessionStore.setState({ userId })
const forbidden = (promise: Promise<unknown>) => expect(promise).rejects.toBeInstanceOf(ForbiddenError)
const invalid = (promise: Promise<unknown>, message: RegExp) => expect(promise).rejects.toThrow(message)
// Entradas fora do contrato de tipos, como chegariam de um cliente HTTP.
const asStatus = (to: string) => ({ to, reason: "" }) as unknown as AbaGoalStatusInput
const asConfirm = (value: unknown) => value as { confirm: true }

// Pacientes, agenda e auditoria agora vêm da API (cobertos em demo-api-http.test.ts): aqui só o escopo
// clínico dos módulos demo, que segue em `demo-context`, e a trilha de auditoria local.
const readsPatient = (id: string) => canReadPatient(actor(), id)
const auditList = (filters: { resource?: string } = {}) =>
  getDB()
    .audit.filter((e) => !filters.resource || e.resource === filters.resource)
    .map(redactClinicalAudit)

const TODAY = clinicDateKey(new Date())
const LONG = "Paciente colaborativo, com boa interação durante toda a sessão de hoje."
const SECRET = "SEGREDO-CLINICO-123"

// Sem agendamentos, o vínculo vem só do profissional de referência do seed:
// pa-001 → Helena, pa-002 → Rafael. pa-001 tem mãe (autorizada) e pai (sem autorização de documentos).
const MINE = "pa-001"
const OTHERS = "pa-002"

const record = (over: Partial<ClinicalRecordInput> = {}): ClinicalRecordInput => ({
  kind: "evolution",
  title: "Evolução da semana",
  content: `${LONG} ${SECRET}`,
  appointmentId: "",
  ...over,
})

let apptSeq = 0
/** Atendimento direto no banco: por padrão liga `pr-rafael` a `MINE`. */
const seedAppointment = (status: AppointmentStatus, over: Partial<Appointment> = {}) => {
  const appt: Appointment = {
    id: `ap-t${++apptSeq}`,
    kind: "appointment",
    patientId: MINE,
    serviceId: "sv-psi",
    professionalId: "pr-rafael",
    start: "2026-01-01T10:00:00.000Z",
    end: "2026-01-01T11:00:00.000Z",
    status,
    createdBy: "u-admin",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  }
  getDB().appointments.push(appt)
  return appt
}

const grantRafaelAccess = () => seedAppointment("completed", { id: "ap-x" })

beforeEach(() => {
  resetDB()
  getDB().appointments = []
  login("u-helena")
})

describe("PRN — RBAC no adaptador", () => {
  it.each([
    ["u-recepcao", "recepção"],
    ["u-financeiro", "financeiro"],
    ["u-admin", "administração"],
  ])("%s (%s) não lê nem escreve prontuário (CA-PRN-001)", async (userId) => {
    login(userId)
    await forbidden(api.clinicalRecords.patients())
    await forbidden(api.clinicalRecords.list(MINE))
    await forbidden(api.clinicalRecords.create(MINE, record()))
  })

  it("profissional só acessa paciente que atende (CA-PRN-002)", async () => {
    login("u-rafael")
    const own = await api.clinicalRecords.create(OTHERS, record({ title: "Registro de Rafael" }))
    login("u-helena")
    const mine = await api.clinicalRecords.create(MINE, record())

    login("u-rafael")
    await forbidden(api.clinicalRecords.list(MINE))
    await forbidden(api.clinicalRecords.create(MINE, record()))
    await forbidden(api.clinicalRecords.get(mine.id))
    // Não vacuoso: a lista do próprio paciente traz exatamente o registro dele, sem o de Helena.
    expect((await api.clinicalRecords.list(OTHERS)).map((r) => r.id)).toEqual([own.id])

    const expected = getDB().patients.filter((p) => p.mainProfessionalId === "pr-rafael").map((p) => p.id).sort()
    expect(expected.length).toBeGreaterThan(0)
    expect(expected).not.toContain(MINE)
    const scoped = await api.clinicalRecords.patients()
    expect(scoped.map((row) => row.patient.id).sort()).toEqual(expected)
    expect([...ownPatientIds(actor())].sort()).toEqual(expected)
  })

  it("papel profissional sem vínculo profissional não alcança paciente sem referência", async () => {
    const db = getDB()
    db.patients.push({ ...db.patients[0], id: "pa-orfao", code: "PAC-9999", mainProfessionalId: undefined })
    db.users.push({ id: "u-sem-vinculo", name: "Sem Vínculo", email: "sv@clinicaflor.demo", title: "Profissional", roles: ["professional"] })
    login("u-sem-vinculo")
    await expect(api.clinicalRecords.patients()).resolves.toEqual([])
    await forbidden(api.clinicalRecords.list("pa-orfao"))
    await forbidden(api.clinicalRecords.create("pa-orfao", record()))
  })

  it("leitura de registro alheio por id também é negada", async () => {
    const created = await api.clinicalRecords.create(MINE, record())
    login("u-rafael")
    await forbidden(api.clinicalRecords.get(created.id))
    await forbidden(api.clinicalRecords.versions(created.id))
  })

  it("só o autor edita, finaliza e retifica, mesmo outro profissional com acesso ao paciente", async () => {
    const created = await api.clinicalRecords.create(MINE, record())
    grantRafaelAccess()
    login("u-rafael")
    await expect(api.clinicalRecords.list(MINE)).resolves.toHaveLength(1)
    await forbidden(api.clinicalRecords.update(created.id, record({ title: "Troca" })))
    await forbidden(api.clinicalRecords.finalize(created.id))
    login("u-helena")
    await api.clinicalRecords.finalize(created.id)
    login("u-rafael")
    await forbidden(api.clinicalRecords.rectify(created.id, { reason: "Correção de data digitada" }))
  })

  it("retificação preserva a original e finaliza a nova versão (CA-PRN-004)", async () => {
    const original = await api.clinicalRecords.create(MINE, record())
    await api.clinicalRecords.finalize(original.id)
    await invalid(api.clinicalRecords.update(original.id, record({ content: "alterado depois de finalizar" })), /Registros finalizados/)

    const draft = await api.clinicalRecords.rectify(original.id, { reason: "Data digitada errada no texto" })
    await invalid(api.clinicalRecords.rectify(original.id, { reason: "Segunda retificação" }), /rascunho/)
    await api.clinicalRecords.update(draft.id, record({ content: `${LONG} Texto corrigido.` }))
    await api.clinicalRecords.finalize(draft.id)

    const [before, after] = await api.clinicalRecords.versions(original.id)
    expect(before).toMatchObject({ id: original.id, status: "rectified", supersededById: draft.id, authorId: "u-helena", content: original.content })
    expect(after).toMatchObject({ id: draft.id, status: "finalized", version: 2, rectifiesId: original.id })
  })

  it("auditoria registra o fato, nunca o conteúdo clínico (RN-PRN-008)", async () => {
    const created = await api.clinicalRecords.create(MINE, record())
    await api.clinicalRecords.update(created.id, record({ content: `${LONG} ${SECRET} editado` }))
    await api.clinicalRecords.finalize(created.id)
    await api.clinicalRecords.rectify(created.id, { reason: "Motivo da correção aqui" })
    const trail = getDB().audit.filter((e) => e.resource === "clinical_record")
    expect(trail.length).toBeGreaterThanOrEqual(4)
    const patientName = getDB().patients.find((p) => p.id === MINE)?.fullName
    expect(patientName).toBeTruthy()
    expect(JSON.stringify(trail)).not.toContain(SECRET)
    expect(JSON.stringify(trail)).not.toContain(patientName!)
    expect(trail.every((e) => !e.changes)).toBe(true)
  })

  it("evolução só vincula atendimento do próprio paciente e profissional (RN-PRN-009)", async () => {
    getDB().appointments.push({
      id: "ap-y",
      kind: "appointment",
      patientId: OTHERS,
      serviceId: "sv-psi",
      professionalId: "pr-helena",
      start: "2026-01-01T10:00:00.000Z",
      end: "2026-01-01T11:00:00.000Z",
      status: "completed",
      createdBy: "u-admin",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })
    await invalid(api.clinicalRecords.create(MINE, record({ appointmentId: "ap-y" })), /atendimento/)
  })
})

describe("AVA — RBAC no adaptador", () => {
  const input = { patientId: MINE, title: "Avaliação inicial", purpose: "Investigação diagnóstica", responsibleProfessionalId: "pr-helena", stages: ["Anamnese", "Testes"] }

  it("perfis não clínicos não acessam avaliações", async () => {
    for (const userId of ["u-recepcao", "u-financeiro", "u-admin"]) {
      login(userId)
      await forbidden(api.assessments.list())
      await forbidden(api.assessments.create(input))
    }
  })

  it("a lista de avaliações traz só as dos pacientes vinculados", async () => {
    const mine = await api.assessments.create(input)
    login("u-rafael")
    const theirs = await api.assessments.create({ ...input, patientId: OTHERS, responsibleProfessionalId: "pr-rafael" })
    expect((await api.assessments.list()).map((a) => a.id)).toEqual([theirs.id])
    login("u-helena")
    expect((await api.assessments.list()).map((a) => a.id)).toEqual([mine.id])
  })

  it("interpretação, etapas e conclusão respeitam responsável e vínculo", async () => {
    const created = await api.assessments.create(input)
    login("u-rafael")
    await forbidden(api.assessments.get(created.id))
    grantRafaelAccess()
    await expect(api.assessments.get(created.id)).resolves.toMatchObject({ id: created.id })

    for (const stage of created.stages) {
      await api.assessments.setStage(created.id, stage.id, "in_progress")
      await api.assessments.setStage(created.id, stage.id, "done")
    }
    await api.assessments.saveInterpretation(created.id, { text: `${LONG} Hipótese a confirmar.` })
    await forbidden(api.assessments.complete(created.id))

    login("u-helena")
    const done = await api.assessments.complete(created.id)
    expect(done.status).toBe("completed")
    expect(done.interpretations[0].authorId).toBe("u-rafael")
    await invalid(api.assessments.saveInterpretation(created.id, { text: `${LONG} Tarde demais.` }), /somente leitura/)
  })

  it("exige responsável ativo", async () => {
    await invalid(api.assessments.create({ ...input, responsibleProfessionalId: "pr-inexistente" }), /responsável ativo/)
  })
})

describe("ABA — RBAC e medidas reais", () => {
  const plan = { patientId: MINE, title: "Plano 2026", startDate: "2026-01-05", reviewDate: "", responsibleProfessionalId: "pr-helena" }
  const goal = { title: "Pedir ajuda", description: "", criterionText: "80% em 2 sessões consecutivas", targetPercent: 80, consecutiveSessions: 2 }

  it("perfis não clínicos e profissional sem vínculo são recusados", async () => {
    const created = await api.aba.createPlan(plan)
    for (const userId of ["u-recepcao", "u-financeiro", "u-admin"]) {
      login(userId)
      await forbidden(api.aba.listPlans())
      await forbidden(api.aba.getPlan(created.id))
      await forbidden(api.aba.createPlan(plan))
    }
    // Profissional sem vínculo: a lista vem restrita aos próprios pacientes; acesso direto é negado.
    login("u-rafael")
    const rafaelPlan = await api.aba.createPlan({ ...plan, patientId: OTHERS, responsibleProfessionalId: "pr-rafael" })
    expect((await api.aba.listPlans()).map((p) => p.id)).toEqual([rafaelPlan.id])
    await forbidden(api.aba.getPlan(created.id))
    await forbidden(api.aba.createPlan(plan))
    login("u-helena")
    expect((await api.aba.listPlans()).map((p) => p.id)).toEqual([created.id])
  })

  it("sem sessões o progresso é 'sem dados', nunca zero (CA-ABA-001)", async () => {
    const created = await api.aba.createPlan(plan)
    await api.aba.saveGoal(created.id, goal)
    const view = await api.aba.getPlan(created.id)
    expect(view.sessions).toEqual([])
    expect(view.progress[0]).toMatchObject({ lastPercent: null, state: "no_data", criterionMet: false })
  })

  it("calcula progresso só das sessões registradas e ignora as anuladas", async () => {
    const created = await api.aba.createPlan(plan)
    const withGoal = await api.aba.saveGoal(created.id, goal)
    const goalId = withGoal.goals[0].id
    await invalid(api.aba.recordSession({ planId: created.id, date: TODAY, notes: "", measures: [{ goalId, trials: 10, correct: 8, note: "" }] }), /ativos/)
    await api.aba.activatePlan(created.id)

    const first = await api.aba.recordSession({ planId: created.id, date: "2026-01-06", notes: "", measures: [{ goalId, trials: 10, correct: 9, note: "" }] })
    const second = await api.aba.recordSession({ planId: created.id, date: "2026-01-07", notes: "", measures: [{ goalId, trials: 10, correct: 8, note: "" }] })
    await invalid(api.aba.setGoalStatus(created.id, goalId, { to: "discontinued", reason: "" }), /motivo/)
    let view = await api.aba.getPlan(created.id)
    expect(view.progress[0]).toMatchObject({ lastPercent: 80, criterionMet: true })

    await api.aba.voidSession(first.id, { reason: "Sessão lançada por engano" })
    view = await api.aba.getPlan(created.id)
    expect(view.progress[0]).toMatchObject({ lastPercent: 80, criterionMet: false })
    expect(view.sessions).toHaveLength(2)
    expect(view.plan.changeLog.some((c) => c.summary.includes("anulada"))).toBe(true)

    // RN-ABA-008: plano encerrado é somente leitura, inclusive para anulações.
    await api.aba.closePlan(created.id, { reason: "Alta do paciente" })
    await invalid(api.aba.voidSession(second.id, { reason: "Tentativa depois do encerramento" }), /somente leitura/)
    await invalid(api.aba.saveGoal(created.id, goal, goalId), /somente leitura/)
  })

  it("auditoria não carrega medidas nem notas de sessão (RN-ABA-009)", async () => {
    const created = await api.aba.createPlan(plan)
    const { goals } = await api.aba.saveGoal(created.id, goal)
    await api.aba.activatePlan(created.id)
    await api.aba.recordSession({ planId: created.id, date: TODAY, notes: SECRET, measures: [{ goalId: goals[0].id, trials: 10, correct: 7, note: SECRET }] })
    expect(JSON.stringify(getDB().audit)).not.toContain(SECRET)
  })
})

describe("FIN — RBAC e baixa no adaptador", () => {
  const entry = {
    kind: "income" as const,
    description: "Mensalidade abril",
    category: "Atendimentos",
    counterparty: "",
    patientId: MINE,
    competence: TODAY.slice(0, 7),
    dueDate: TODAY,
    amount: 100,
  }
  const payment = (amount: number, requestId: string) => ({ amount, paidAt: TODAY, method: "pix" as const, requestId })

  it("só o financeiro escreve; administração apenas lê; demais perfis são negados (CA-FIN-004)", async () => {
    login("u-financeiro")
    const created = await api.financial.create(entry)

    login("u-admin")
    await expect(api.financial.list()).resolves.toHaveLength(1)
    await forbidden(api.financial.create(entry))
    await forbidden(api.financial.registerPayment(created.id, payment(10, "r-adm")))
    await forbidden(api.financial.cancel(created.id, { reason: "Teste de permissão" }))

    for (const userId of ["u-recepcao", "u-helena", "u-beatriz"]) {
      login(userId)
      await forbidden(api.financial.list())
      await forbidden(api.financial.summary(entry.competence))
    }
  })

  it("aceita parcelas, recusa excesso e dupla baixa, e é idempotente por requestId (CA-FIN-001/002)", async () => {
    login("u-financeiro")
    const created = await api.financial.create(entry)

    const first = await api.financial.registerPayment(created.id, payment(40, "r1"))
    await expect(api.financial.registerPayment(created.id, payment(40, "r1"))).resolves.toMatchObject({ id: first.id })
    await invalid(api.financial.registerPayment(created.id, payment(70, "r2")), /excede o saldo/)
    await api.financial.registerPayment(created.id, payment(60, "r3"))
    await invalid(api.financial.registerPayment(created.id, payment(1, "r4")), /quitado/)

    const detail = await api.financial.get(created.id)
    expect(detail).toMatchObject({ status: "paid", paidCents: 10000, balanceCents: 0 })
    expect(detail.payments).toHaveLength(2)
  })

  it("não cancela com pagamento ativo; estorna e cancela sem apagar registros (CA-FIN-003)", async () => {
    login("u-financeiro")
    const created = await api.financial.create(entry)
    const paid = await api.financial.registerPayment(created.id, payment(100, "r1"))
    await invalid(api.financial.cancel(created.id, { reason: "Lançado em duplicidade" }), /Estorne/)

    await api.financial.reversePayment(paid.id, { reason: "Pix devolvido ao pagador" })
    await invalid(api.financial.reversePayment(paid.id, { reason: "Outra vez, por engano" }), /já foi estornado/)
    await api.financial.cancel(created.id, { reason: "Lançado em duplicidade" })

    const detail = await api.financial.get(created.id)
    expect(detail.status).toBe("cancelled")
    expect(detail.payments).toHaveLength(1)
    expect(detail.payments[0].reversedAt).toBeDefined()
    expect(getDB().financialEntries).toHaveLength(1)
    await invalid(api.financial.registerPayment(created.id, payment(10, "r9")), /cancelado/)
  })

  it("não altera o valor abaixo do já pago e resume só dados reais", async () => {
    login("u-financeiro")
    const created = await api.financial.create(entry)
    await api.financial.registerPayment(created.id, payment(30, "r1"))
    await invalid(api.financial.update(created.id, { ...entry, amount: 20 }), /abaixo/)
    await expect(api.financial.summary("1999-01")).resolves.toMatchObject({ realizedResultCents: 0 })
    const month = await api.financial.summary(entry.competence)
    expect(month.income).toMatchObject({ count: 1, expectedCents: 10000, settledCents: 3000, openCents: 7000 })
  })

  it("não guarda campos clínicos e usa coleções próprias (RN-FIN-009)", async () => {
    login("u-helena")
    await api.clinicalRecords.create(MINE, record())
    login("u-financeiro")
    await api.financial.create(entry)
    const db = getDB()
    expect(db.financialEntries).toHaveLength(1)
    expect(db.clinicalRecords).toHaveLength(1)
    expect(Object.keys(db.financialEntries[0]).filter((k) => /clinic|record|content|anamn|evol|diagn/i.test(k))).toEqual([])
    expect(JSON.stringify(db.financialEntries)).not.toContain(SECRET)
    const summaries = db.audit.filter((e) => e.resource.startsWith("financial")).map((e) => e.summary)
    expect(summaries.length).toBeGreaterThan(0)
    expect(summaries.join(" ")).not.toMatch(/\d+,\d{2}|R\$/)
  })

  it("recusa competência, valor e data inválidos", async () => {
    login("u-financeiro")
    await invalid(api.financial.create({ ...entry, competence: "2026-13" }), /Competência/)
    await invalid(api.financial.create({ ...entry, amount: 0 }), /maior que zero/)
    await invalid(api.financial.create({ ...entry, dueDate: "31/04/2026" }), /Data inválida|Vencimento/)
    const created = await api.financial.create(entry)
    await invalid(api.financial.registerPayment(created.id, { ...payment(10, "r1"), paidAt: "2999-01-01" }), /futura/)
  })
})

describe("DOC — RBAC, estados e liberação no adaptador", () => {
  const base = { patientId: MINE, title: "Termo de consentimento", type: "Termo", classification: "administrative" as const, clinicalRecordId: "", notes: "" }

  it("cada perfil só cria e vê as classificações que pode (CA-DOC-003)", async () => {
    login("u-recepcao")
    await api.documents.create(base)
    await forbidden(api.documents.create({ ...base, classification: "clinical" }))
    await forbidden(api.documents.create({ ...base, classification: "financial" }))

    login("u-financeiro")
    await api.documents.create({ ...base, title: "Recibo de pagamento", classification: "financial" })
    await forbidden(api.documents.create({ ...base, title: "Contrato", classification: "administrative" }))

    login("u-recepcao")
    const seen = await api.documents.list()
    expect(seen.map((r) => r.doc.classification)).toEqual(["administrative"])

    login("u-admin")
    expect((await api.documents.list()).map((r) => r.doc.classification).sort()).toEqual(["administrative", "financial"])

    // Profissional/gestora: só documento administrativo de paciente que ela atende (pa-004), nada dos outros.
    login("u-recepcao")
    const hers = await api.documents.create({ ...base, patientId: "pa-004", title: "Termo da paciente da Beatriz" })
    login("u-beatriz")
    expect((await api.documents.list()).map((r) => r.doc.id)).toEqual([hers.id])
  })

  it("liberação é explícita, só para responsável autorizado e documento emitido (CA-DOC-001/002/004)", async () => {
    login("u-recepcao")
    const doc = await api.documents.create(base)
    await invalid(api.documents.release(doc.id, { guardianId: "gu-1" }), /emitidos/)
    await api.documents.setStatus(doc.id, "issued")
    await invalid(api.documents.release(doc.id, { guardianId: "gu-2" }), /não está autorizado/)
    await invalid(api.documents.release(doc.id, { guardianId: "gu-3" }), /não está vinculado/)

    const release = await api.documents.release(doc.id, { guardianId: "gu-1" })
    await invalid(api.documents.release(doc.id, { guardianId: "gu-1" }), /já está liberado/)
    await invalid(api.documents.revokeRelease(doc.id, release.id, { reason: "x" }), /motivo/)

    await api.documents.setStatus(doc.id, "archived")
    const { doc: archived } = await api.documents.get(doc.id)
    expect(archived.releases).toHaveLength(1)
    expect(archived.releases[0].revokedAt).toBeDefined()
    await invalid(api.documents.release(doc.id, { guardianId: "gu-1" }), /emitidos/)
  })

  it("só edita rascunho e não muda classificação", async () => {
    login("u-recepcao")
    const doc = await api.documents.create(base)
    const edited = await api.documents.update(doc.id, { ...base, title: "Termo revisado", classification: "financial" })
    expect(edited).toMatchObject({ title: "Termo revisado", classification: "administrative" })
    await api.documents.setStatus(doc.id, "issued")
    await invalid(api.documents.update(doc.id, base), /rascunho/)
  })

  it("documento clínico referencia o prontuário e a retificação revoga liberações (RN-DOC-002/006)", async () => {
    login("u-helena")
    await invalid(api.documents.create({ ...base, classification: "clinical" }), /Vincule/)
    const note = await api.clinicalRecords.create(MINE, record({ kind: "document", title: "Relatório clínico" }))
    const doc = await api.documents.create({ ...base, title: "Relatório", classification: "clinical", clinicalRecordId: note.id })
    await invalid(api.documents.setStatus(doc.id, "issued"), /finalizado/)

    await api.clinicalRecords.finalize(note.id)
    await api.documents.setStatus(doc.id, "issued")
    await api.documents.release(doc.id, { guardianId: "gu-1" })
    expect((await api.documents.get(doc.id)).doc.releases.filter((r) => !r.revokedAt)).toHaveLength(1)

    const rect = await api.clinicalRecords.rectify(note.id, { reason: "Dado incorreto no relatório" })
    await api.clinicalRecords.finalize(rect.id)
    const after = (await api.documents.get(doc.id)).doc
    expect(after.releases.filter((r) => !r.revokedAt)).toHaveLength(0)
    expect(after.releases[0].revokeReason).toBe("Registro clínico retificado")

    // Precisa ser liberado de novo, explicitamente.
    await expect(api.documents.release(doc.id, { guardianId: "gu-1" })).resolves.toMatchObject({ guardianId: "gu-1" })
  })

  it("profissional sem vínculo não vê documento clínico alheio", async () => {
    login("u-helena")
    const note = await api.clinicalRecords.create(MINE, record({ kind: "document", title: "Laudo" }))
    const doc = await api.documents.create({ ...base, title: "Laudo", classification: "clinical", clinicalRecordId: note.id })
    login("u-rafael")
    const ownNote = await api.clinicalRecords.create(OTHERS, record({ kind: "document", title: "Laudo do Rafael" }))
    const ownDoc = await api.documents.create({ ...base, patientId: OTHERS, title: "Laudo do Rafael", classification: "clinical", clinicalRecordId: ownNote.id })
    expect((await api.documents.list()).map((r) => r.doc.id)).toEqual([ownDoc.id])
    await forbidden(api.documents.get(doc.id))
    await forbidden(api.documents.setStatus(doc.id, "archived"))
  })

  it("documento clínico só é criado e liberado pelo autor do registro vinculado (RN-DOC-008)", async () => {
    login("u-helena")
    const note = await api.clinicalRecords.create(MINE, record({ kind: "document", title: "Relatório" }))
    await api.clinicalRecords.finalize(note.id)
    grantRafaelAccess()

    // Rafael tem vínculo e escrita clínica no paciente, mas não é o autor do registro.
    login("u-rafael")
    await forbidden(api.documents.create({ ...base, classification: "clinical", clinicalRecordId: note.id }))

    login("u-helena")
    const doc = await api.documents.create({ ...base, title: "Relatório", classification: "clinical", clinicalRecordId: note.id })
    await api.documents.setStatus(doc.id, "issued")

    login("u-rafael")
    expect(await api.documents.get(doc.id)).toMatchObject({ canWrite: true })
    await forbidden(api.documents.release(doc.id, { guardianId: "gu-1" }))
    expect((await api.documents.get(doc.id)).doc.releases).toEqual([])

    login("u-helena")
    await expect(api.documents.release(doc.id, { guardianId: "gu-1" })).resolves.toMatchObject({ guardianId: "gu-1", releasedBy: "u-helena" })
  })
})

describe("DOC — vínculo do responsável e liberações ativas (RN-DOC-009)", () => {
  const base = { patientId: MINE, title: "Termo de consentimento", type: "Termo", classification: "administrative" as const, clinicalRecordId: "", notes: "" }
  const linkOf = (patientId: string, guardianId: string) => getDB().links.find((l) => l.patientId === patientId && l.guardianId === guardianId)!
  const issued = async (patientId = MINE, title = base.title) => {
    login("u-recepcao")
    const doc = await api.documents.create({ ...base, patientId, title })
    await api.documents.setStatus(doc.id, "issued")
    return doc
  }
  const releasesOf = async (id: string) => (await api.documents.get(id)).doc.releases
  // O vínculo agora é gravado na API, que também encerra as liberações; aqui vale a revogação dos documentos demo.
  const revoke = (patientId: string, guardianId: string, reason = "Vínculo do responsável com o paciente removido") =>
    revokeGuardianReleases(patientId, guardianId, reason, actor(), now())

  it("revoga todas as liberações ativas do responsável e mantém o histórico", async () => {
    // O pai (gu-2) nasce sem autorização de documentos; autoriza-se para ter uma segunda liberação.
    login("u-recepcao")
    linkOf(MINE, "gu-2").canReceiveDocuments = true
    const first = await issued(MINE, "Termo 1")
    const second = await issued(MINE, "Termo 2")
    for (const doc of [first, second]) {
      await api.documents.release(doc.id, { guardianId: "gu-1" })
      await api.documents.release(doc.id, { guardianId: "gu-2" })
    }

    revoke(MINE, "gu-1")

    for (const doc of [first, second]) {
      const releases = await releasesOf(doc.id)
      expect(releases).toHaveLength(2)
      const mother = releases.find((r) => r.guardianId === "gu-1")!
      expect(mother).toMatchObject({ releasedBy: "u-recepcao", revokedBy: "u-recepcao" })
      expect(mother.revokedAt).toBeDefined()
      expect(mother.revokeReason).toMatch(/vínculo/i)
      // Só quem foi desvinculado perde a liberação.
      expect(activeReleases({ releases }).map((r) => r.guardianId)).toEqual(["gu-2"])
    }
    const { guardianNames } = await api.documents.get(first.id)
    expect(guardianNames["gu-1"]).toBe(getDB().guardians.find((g) => g.id === "gu-1")!.fullName)
  })

  it("sem autorização de receber documentos não há nova liberação depois da revogação", async () => {
    const doc = await issued()
    const release = await api.documents.release(doc.id, { guardianId: "gu-1" })

    linkOf(MINE, "gu-1").canReceiveDocuments = false
    revoke(MINE, "gu-1", "Autorização do responsável para receber documentos encerrada")

    const releases = await releasesOf(doc.id)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({ id: release.id, releasedBy: "u-recepcao" })
    expect(releases[0].revokedAt).toBeDefined()
    expect(activeReleases({ releases })).toEqual([])
    await invalid(api.documents.release(doc.id, { guardianId: "gu-1" }), /não está autorizado/)
  })

  it("outros pacientes do mesmo responsável não são afetados", async () => {
    login("u-recepcao")
    const { id, ...otherLink } = linkOf(MINE, "gu-1")
    getDB().links.push({ ...otherLink, id: "ln-outro", patientId: OTHERS })
    const mine = await issued(MINE, "Termo do paciente 1")
    const theirs = await issued(OTHERS, "Termo do paciente 2")
    await api.documents.release(mine.id, { guardianId: "gu-1" })
    await api.documents.release(theirs.id, { guardianId: "gu-1" })

    revoke(MINE, "gu-1")
    expect(activeReleases({ releases: await releasesOf(mine.id) })).toEqual([])
    expect(activeReleases({ releases: await releasesOf(theirs.id) })).toHaveLength(1)
  })

  it("a revogação automática é auditada sem dados do documento ou do responsável", async () => {
    const doc = await issued(MINE, "Termo com título sigiloso")
    await api.documents.release(doc.id, { guardianId: "gu-1" })
    revoke(MINE, "gu-1")
    const trail = getDB().audit.filter((e) => e.resource === "document_release" && e.action === "status_change")
    expect(trail).toHaveLength(1)
    expect(JSON.stringify(trail)).not.toContain("sigiloso")
    expect(JSON.stringify(trail)).not.toContain(getDB().guardians.find((g) => g.id === "gu-1")!.fullName)
  })

  it("liberação ativa que sobrou de antes continua visível e revogável após o desvínculo", async () => {
    const doc = await issued()
    const release = await api.documents.release(doc.id, { guardianId: "gu-1" })
    // Dado antigo: o vínculo foi removido sem revogar a liberação.
    getDB().links = getDB().links.filter((l) => !(l.patientId === MINE && l.guardianId === "gu-1"))

    const seen = await api.documents.get(doc.id)
    expect(seen.canWrite).toBe(true)
    expect(activeReleases(seen.doc).map((r) => r.id)).toEqual([release.id])
    expect(seen.guardianNames["gu-1"]).toBeTruthy()

    await api.documents.revokeRelease(doc.id, release.id, { reason: "Vínculo removido antes da correção" })
    const after = (await api.documents.get(doc.id)).doc
    expect(activeReleases(after)).toEqual([])
    expect(after.releases[0].revokeReason).toBe("Vínculo removido antes da correção")
  })
})

describe("PRN — vínculo clínico por atendimento (RN-PRN-001)", () => {
  it.each(["requested", "pending", "cancelled", "no_show"] as const)("atendimento %s não concede acesso ao prontuário", async (status) => {
    const created = await api.clinicalRecords.create(MINE, record())
    seedAppointment(status)
    login("u-rafael")
    await forbidden(api.clinicalRecords.list(MINE))
    await forbidden(api.clinicalRecords.get(created.id))
    await forbidden(api.clinicalRecords.create(MINE, record()))
    expect(readsPatient(MINE)).toBe(false)
    expect((await api.clinicalRecords.patients()).map((row) => row.patient.id)).not.toContain(MINE)
  })

  it.each(["confirmed", "in_progress", "completed"] as const)("atendimento %s concede acesso, só ao profissional do atendimento", async (status) => {
    const created = await api.clinicalRecords.create(MINE, record())
    seedAppointment(status)
    login("u-rafael")
    expect((await api.clinicalRecords.list(MINE)).map((r) => r.id)).toEqual([created.id])
    expect((await api.clinicalRecords.patients()).map((row) => row.patient.id)).toContain(MINE)
    expect(readsPatient(MINE)).toBe(true)
    login("u-camila")
    await forbidden(api.clinicalRecords.list(MINE))
  })

  it("profissional inativo perde o acesso, como referência ou por atendimento", async () => {
    const created = await api.clinicalRecords.create(MINE, record())
    expect((await api.clinicalRecords.patients()).map((row) => row.patient.id)).toContain(MINE)
    const helena = getDB().professionals.find((p) => p.id === "pr-helena")!
    helena.active = false
    await forbidden(api.clinicalRecords.list(MINE))
    await forbidden(api.clinicalRecords.get(created.id))
    await forbidden(api.clinicalRecords.create(MINE, record()))
    expect(readsPatient(MINE)).toBe(false)
    await expect(api.clinicalRecords.patients()).resolves.toEqual([])
    helena.active = true
    await expect(api.clinicalRecords.list(MINE)).resolves.toHaveLength(1)

    grantRafaelAccess()
    login("u-rafael")
    await expect(api.clinicalRecords.list(MINE)).resolves.toHaveLength(1)
    getDB().professionals.find((p) => p.id === "pr-rafael")!.active = false
    await forbidden(api.clinicalRecords.list(MINE))
  })
})

describe("AVA/ABA — responsável precisa poder operar (RN-AVA-001)", () => {
  const assessment = (responsibleProfessionalId: string) => ({
    patientId: MINE,
    title: "Avaliação inicial",
    purpose: "Investigação diagnóstica",
    responsibleProfessionalId,
    stages: ["Anamnese"],
  })
  const plan = (responsibleProfessionalId: string) => ({ patientId: MINE, title: "Plano 2026", startDate: "2026-01-05", reviewDate: "", responsibleProfessionalId })
  const refused = /responsável ativo e vinculado/

  it("recusa responsável sem vínculo com o paciente, e aceita quando há atendimento confirmado", async () => {
    await invalid(api.assessments.create(assessment("pr-camila")), refused)
    await invalid(api.aba.createPlan(plan("pr-camila")), refused)
    expect(getDB().assessments).toEqual([])
    expect(getDB().abaPlans).toEqual([])

    seedAppointment("pending", { professionalId: "pr-camila" })
    await invalid(api.assessments.create(assessment("pr-camila")), refused)

    seedAppointment("confirmed", { professionalId: "pr-camila" })
    await expect(api.assessments.create(assessment("pr-camila"))).resolves.toMatchObject({ responsibleProfessionalId: "pr-camila" })
    await expect(api.aba.createPlan(plan("pr-camila"))).resolves.toMatchObject({ responsibleProfessionalId: "pr-camila" })
  })

  it("recusa responsável inativo, mesmo vinculado", async () => {
    grantRafaelAccess()
    await expect(api.assessments.create(assessment("pr-rafael"))).resolves.toMatchObject({ responsibleProfessionalId: "pr-rafael" })
    getDB().professionals.find((p) => p.id === "pr-rafael")!.active = false
    await invalid(api.assessments.create(assessment("pr-rafael")), refused)
    await invalid(api.aba.createPlan(plan("pr-rafael")), refused)
  })

  it("recusa responsável sem conta de perfil clínico (ninguém poderia concluir ou cancelar)", async () => {
    // pr-lucas é profissional ativo e atende o paciente, mas não há usuário vinculado a ele.
    seedAppointment("completed", { professionalId: "pr-lucas" })
    expect(getDB().users.some((u) => u.professionalId === "pr-lucas")).toBe(false)
    await invalid(api.assessments.create(assessment("pr-lucas")), refused)
    await invalid(api.aba.createPlan(plan("pr-lucas")), refused)
  })

  it("editar o plano também exige responsável que possa operá-lo", async () => {
    const created = await api.aba.createPlan(plan("pr-helena"))
    await invalid(api.aba.updatePlan(created.id, { ...plan("pr-camila"), title: "Plano revisado" }), refused)
    expect((await api.aba.getPlan(created.id)).plan).toMatchObject({ title: "Plano 2026", responsibleProfessionalId: "pr-helena" })
    seedAppointment("confirmed", { professionalId: "pr-camila" })
    await expect(api.aba.updatePlan(created.id, { ...plan("pr-camila"), title: "Plano revisado" })).resolves.toMatchObject({ responsibleProfessionalId: "pr-camila" })
  })
})

describe("ABA — objetivos: estado terminal e meta (RN-ABA-006/010)", () => {
  const plan = { patientId: MINE, title: "Plano 2026", startDate: "2026-01-05", reviewDate: "", responsibleProfessionalId: "pr-helena" }
  const goal = { title: "Pedir ajuda", description: "", criterionText: "80% em 2 sessões consecutivas", targetPercent: 80, consecutiveSessions: 2 }
  const setup = async () => {
    const created = await api.aba.createPlan(plan)
    const goalId = (await api.aba.saveGoal(created.id, goal)).goals[0].id
    await api.aba.activatePlan(created.id)
    return { planId: created.id, goalId }
  }
  const measure = (planId: string, goalId: string, date: string, correct: number) =>
    api.aba.recordSession({ planId, date, notes: "", measures: [{ goalId, trials: 10, correct, note: "" }] })
  const goalOf = async (planId: string) => (await api.aba.getPlan(planId)).plan.goals[0]

  it("só objetivo ativo muda; nunca volta a ativo, e o motivo e o histórico permanecem", async () => {
    const { planId, goalId } = await setup()
    await invalid(api.aba.setGoalStatus(planId, goalId, asStatus("active")), /alcançado ou descontinuado/)
    await api.aba.setGoalStatus(planId, goalId, { to: "discontinued", reason: "Objetivo não é mais funcional" })

    for (const to of ["active", "achieved", "discontinued"]) {
      await expect(api.aba.setGoalStatus(planId, goalId, asStatus(to))).rejects.toThrow()
    }
    await invalid(api.aba.setGoalStatus(planId, goalId, { to: "achieved", reason: "Tentativa depois de descontinuar" }), /definitivo/)
    await invalid(api.aba.saveGoal(planId, { ...goal, title: "Outro título" }, goalId), /não pode ser editado/)

    expect(await goalOf(planId)).toMatchObject({ status: "discontinued", statusReason: "Objetivo não é mais funcional" })
    const { plan: after } = await api.aba.getPlan(planId)
    const entry = after.changeLog.find((c) => c.summary.includes("Descontinuado"))
    expect(entry?.changes).toMatchObject({ status: { from: "active", to: "discontinued" }, statusReason: { to: "Objetivo não é mais funcional" } })
    expect(after.changeLog.filter((c) => c.changes?.status)).toHaveLength(2) // ativação do plano + descontinuação
  })

  it("objetivo alcançado também é definitivo", async () => {
    const { planId, goalId } = await setup()
    await measure(planId, goalId, "2026-01-06", 9)
    await measure(planId, goalId, "2026-01-07", 8)
    await api.aba.setGoalStatus(planId, goalId, { to: "achieved", reason: "Critério atingido nas duas sessões" })
    await invalid(api.aba.setGoalStatus(planId, goalId, { to: "discontinued", reason: "Mudança de rota depois" }), /definitivo/)
    expect(await goalOf(planId)).toMatchObject({ status: "achieved", statusReason: "Critério atingido nas duas sessões" })
  })

  it("com medidas registradas, a meta não baixa (mas pode subir); sessão anulada não trava", async () => {
    const { planId, goalId } = await setup()
    await api.aba.saveGoal(planId, { ...goal, targetPercent: 70 }, goalId) // sem medidas, ainda pode baixar
    const first = await measure(planId, goalId, "2026-01-06", 6)

    await invalid(api.aba.saveGoal(planId, { ...goal, targetPercent: 60 }, goalId), /não podem ser reduzidas/)
    await invalid(api.aba.saveGoal(planId, { ...goal, targetPercent: 70, consecutiveSessions: 1 }, goalId), /não podem ser reduzidas/)
    expect(await goalOf(planId)).toMatchObject({ targetPercent: 70, consecutiveSessions: 2 })
    await api.aba.saveGoal(planId, { ...goal, targetPercent: 90 }, goalId)
    expect(await goalOf(planId)).toMatchObject({ targetPercent: 90 })

    await api.aba.voidSession(first.id, { reason: "Sessão lançada por engano" })
    await api.aba.saveGoal(planId, { ...goal, targetPercent: 75 }, goalId)
    expect(await goalOf(planId)).toMatchObject({ targetPercent: 75 })
  })
})

describe("CFG — auditoria sem PII clínica (RN-PRN-008, RN-DOC-007, RN-CFG-003)", () => {
  const TITLE = "Titulo-Clinico-Sigiloso"
  const CLINICAL_RESOURCES = ["clinical_record", "assessment", "aba_plan", "aba_session", "document", "document_release"]
  const patientName = () => getDB().patients.find((p) => p.id === MINE)!.fullName
  const manager = { id: "u-gestor", name: "Gestor Teste", email: "gestor@clinicaflor.demo", title: "Gestão", roles: ["manager" as const] }
  const legacy = (resource: string, action = "update"): AuditEntry => ({
    id: `au-legacy-${resource}`,
    at: "2026-01-01T10:00:00.000Z",
    actorId: "u-helena",
    actorName: "Helena Ramos",
    action,
    resource,
    resourceId: "legacy-id",
    summary: `Editou "${TITLE}" de ${patientName()}: ${SECRET}`,
    changes: { title: { from: TITLE, to: `${TITLE} revisado` }, content: { from: SECRET, to: `${SECRET} novo` } },
  })

  it("registros antigos de recursos clínicos voltam sem nome de paciente, título, conteúdo nem diff", async () => {
    getDB().users.push(manager)
    getDB().audit.unshift(...CLINICAL_RESOURCES.map((r) => legacy(r)), { ...legacy("guardian"), id: "au-legacy-guardian", summary: "Atualizou o responsável Fulano", changes: undefined })

    login("u-gestor")
    // O gestor não tem acesso clínico nem a pacientes: só a auditoria.
    await forbidden(api.clinicalRecords.list(MINE))
    expect(readsPatient(MINE)).toBe(false)

    const entries = auditList()
    const clinical = entries.filter((e) => CLINICAL_RESOURCES.includes(e.resource))
    expect(clinical.map((e) => e.resource).sort()).toEqual([...CLINICAL_RESOURCES].sort())
    const text = JSON.stringify(clinical)
    for (const leaked of [TITLE, SECRET, patientName(), "revisado"]) expect(text).not.toContain(leaked)
    expect(clinical.every((e) => !e.changes && /^(Alterou|Criou)/.test(e.summary))).toBe(true)
    // O fato permanece: quem, quando e qual ação.
    expect(clinical[0]).toMatchObject({ actorId: "u-helena", at: "2026-01-01T10:00:00.000Z", action: "update" })
    // Recursos não clínicos seguem como estão.
    expect(entries.find((e) => e.resource === "guardian")?.summary).toBe("Atualizou o responsável Fulano")
    // E o filtro por recurso continua valendo.
    const onlyRecords = auditList({ resource: "clinical_record" })
    expect(onlyRecords).toHaveLength(1)
    expect(JSON.stringify(onlyRecords)).not.toContain(TITLE)
    // A redação é só na leitura: o dado guardado não é alterado.
    expect(getDB().audit.find((e) => e.id === "au-legacy-clinical_record")?.summary).toContain(TITLE)
  })

  it("nenhuma escrita clínica ou de documento grava nome, título ou conteúdo", async () => {
    const created = await api.clinicalRecords.create(MINE, record({ kind: "document", title: `${TITLE} prontuário`, content: `${LONG} ${SECRET}` }))
    await api.clinicalRecords.update(created.id, record({ kind: "document", title: `${TITLE} prontuário 2`, content: `${LONG} ${SECRET} 2` }))
    await api.clinicalRecords.finalize(created.id)
    const av = await api.assessments.create({ patientId: MINE, title: `${TITLE} avaliação`, purpose: `Finalidade ${SECRET}`, responsibleProfessionalId: "pr-helena", stages: [`Etapa ${TITLE}`] })
    await api.assessments.saveInterpretation(av.id, { text: `${LONG} ${SECRET}` })
    await api.assessments.cancel(av.id, { reason: `Motivo ${SECRET}` })
    const plan = await api.aba.createPlan({ patientId: MINE, title: `${TITLE} plano`, startDate: "2026-01-05", reviewDate: "", responsibleProfessionalId: "pr-helena" })
    const { goals } = await api.aba.saveGoal(plan.id, { title: `${TITLE} objetivo`, description: SECRET, criterionText: "80% em 2 sessões consecutivas", targetPercent: 80, consecutiveSessions: 2 })
    await api.aba.activatePlan(plan.id)
    const session = await api.aba.recordSession({ planId: plan.id, date: TODAY, notes: SECRET, measures: [{ goalId: goals[0].id, trials: 10, correct: 7, note: SECRET }] })
    await api.aba.voidSession(session.id, { reason: `Motivo ${SECRET}` })
    const doc = await api.documents.create({ patientId: MINE, title: `${TITLE} documento`, type: "Relatório", classification: "clinical", clinicalRecordId: created.id, notes: SECRET })
    await api.documents.setStatus(doc.id, "issued")
    const release = await api.documents.release(doc.id, { guardianId: "gu-1" })
    await api.documents.revokeRelease(doc.id, release.id, { reason: `Motivo ${SECRET}` })

    getDB().users.push(manager)
    login("u-gestor")
    const entries = auditList().filter((e) => CLINICAL_RESOURCES.includes(e.resource))
    expect(new Set(entries.map((e) => e.resource))).toEqual(new Set(CLINICAL_RESOURCES))
    const stored = JSON.stringify(getDB().audit.filter((e) => CLINICAL_RESOURCES.includes(e.resource)))
    for (const leaked of [TITLE, SECRET, patientName()]) {
      expect(JSON.stringify(entries)).not.toContain(leaked)
      expect(stored).not.toContain(leaked)
    }
    expect(entries.every((e) => !e.changes)).toBe(true)
  })

  it("leituras clínicas deixam rastro sem PII, uma vez por janela, e só quando o acesso é permitido", async () => {
    const note = await api.clinicalRecords.create(MINE, record({ kind: "document", title: `${TITLE} prontuário` }))
    const av = await api.assessments.create({ patientId: MINE, title: `${TITLE} avaliação`, purpose: "Investigação diagnóstica", responsibleProfessionalId: "pr-helena", stages: ["Anamnese"] })
    const plan = await api.aba.createPlan({ patientId: MINE, title: `${TITLE} plano`, startDate: "2026-01-05", reviewDate: "", responsibleProfessionalId: "pr-helena" })
    const clinicalDoc = await api.documents.create({ patientId: MINE, title: `${TITLE} documento`, type: "Relatório", classification: "clinical", clinicalRecordId: note.id, notes: "" })
    login("u-recepcao")
    const adminDoc = await api.documents.create({ patientId: MINE, title: "Termo", type: "Termo", classification: "administrative", clinicalRecordId: "", notes: "" })
    login("u-helena")
    const reads = () => getDB().audit.filter((e) => e.action === "read")
    await api.clinicalRecords.patients()
    await api.clinicalRecords.list(MINE)
    await api.clinicalRecords.get(note.id)
    await api.clinicalRecords.versions(note.id)
    await api.assessments.list()
    await api.assessments.get(av.id)
    await api.aba.listPlans()
    await api.aba.getPlan(plan.id)
    await api.documents.list()
    await api.documents.get(clinicalDoc.id)
    await api.documents.get(adminDoc.id) // documento não clínico: sem auditoria de leitura
    // Repetir a mesma leitura dentro da janela não cria outro registro.
    await api.clinicalRecords.list(MINE)
    await api.clinicalRecords.get(note.id)

    expect(reads().map((e) => `${e.resource}:${e.resourceId}`).sort()).toEqual(
      [
        `clinical_record:${MINE}`,
        `clinical_record:${note.id}`,
        "assessment:own",
        `assessment:${av.id}`,
        "aba_plan:own",
        `aba_plan:${plan.id}`,
        `document:${clinicalDoc.id}`,
      ].sort()
    )
    expect(reads().every((e) => e.actorId === "u-helena" && !e.changes)).toBe(true)
    for (const leaked of [TITLE, patientName()]) expect(JSON.stringify(reads())).not.toContain(leaked)

    // Acesso negado não vira "leitura": nada novo na trilha.
    const before = reads().length
    login("u-rafael")
    await forbidden(api.clinicalRecords.list(MINE))
    await forbidden(api.clinicalRecords.get(note.id))
    await forbidden(api.assessments.get(av.id))
    await forbidden(api.aba.getPlan(plan.id))
    await forbidden(api.documents.get(clinicalDoc.id))
    expect(reads()).toHaveLength(before)

    // O gestor enxerga as leituras na auditoria, sem nada além do fato.
    getDB().users.push(manager)
    login("u-gestor")
    const listed = auditList().filter((e) => e.action === "read")
    expect(listed).toHaveLength(before)
    expect(listed.every((e) => /^Consultou /.test(e.summary))).toBe(true)
  })
})

describe("AUTH — restauração dos dados de demonstração (RF-AUTH-005, RN-AUTH-007)", () => {
  const seedFinancialEntry = async () => {
    login("u-financeiro")
    await api.financial.create({ kind: "income", description: "Mensalidade", category: "Atendimentos", counterparty: "", patientId: MINE, competence: TODAY.slice(0, 7), dueDate: TODAY, amount: 100 })
  }

  it.each(["u-recepcao", "u-helena", "u-financeiro", "u-beatriz"])("%s não restaura os dados, nem confirmando", async (userId) => {
    await seedFinancialEntry()
    login(userId)
    await forbidden(api.auth.resetDemo({ confirm: true }))
    expect(getDB().financialEntries).toHaveLength(1)
  })

  it("a administração só restaura com confirmação explícita", async () => {
    await seedFinancialEntry()
    login("u-admin")
    await invalid(api.auth.resetDemo(asConfirm(undefined)), /Confirme/)
    await invalid(api.auth.resetDemo(asConfirm({})), /Confirme/)
    await invalid(api.auth.resetDemo(asConfirm({ confirm: false })), /Confirme/)
    await invalid(api.auth.resetDemo(asConfirm({ confirm: "true" })), /Confirme/)
    expect(getDB().financialEntries).toHaveLength(1)

    await api.auth.resetDemo({ confirm: true })
    expect(getDB().financialEntries).toEqual([])
  })
})

describe("FIN — centavos, no schema e na regra de domínio (RN-FIN-001)", () => {
  const entry = {
    kind: "income" as const,
    description: "Mensalidade abril",
    category: "Atendimentos",
    counterparty: "",
    patientId: MINE,
    competence: TODAY.slice(0, 7),
    dueDate: TODAY,
    amount: 100,
  }
  const payment = (amount: number, requestId: string) => ({ amount, paidAt: TODAY, method: "pix" as const, requestId })
  const BAD_AMOUNTS = [0.004, 0.001, 0.005, 10.005, 1.234, 99.999, 0.1 + 0.2 + 0.0001]

  it.each(BAD_AMOUNTS)("recusa %s ao criar, editar e pagar (arredonda a zero ou passa de 2 casas)", async (amount) => {
    login("u-financeiro")
    await invalid(api.financial.create({ ...entry, amount }), /maior que zero|casas decimais/)
    expect(getDB().financialEntries).toEqual([])

    const created = await api.financial.create(entry)
    await invalid(api.financial.update(created.id, { ...entry, amount }), /maior que zero|casas decimais/)
    await invalid(api.financial.registerPayment(created.id, payment(amount, `r-${amount}`)), /maior que zero|casas decimais/)
    expect(getDB().financialEntries[0].amountCents).toBe(10000)
    expect(getDB().financialPayments).toEqual([])
  })

  it("aceita centavos exatos, inclusive os que o ponto flutuante distorce", async () => {
    login("u-financeiro")
    const created = await api.financial.create({ ...entry, amount: 19.99 })
    expect(created.amountCents).toBe(1999)
    expect((await api.financial.update(created.id, { ...entry, amount: 0.1 + 0.2 })).amountCents).toBe(30)
    expect((await api.financial.update(created.id, { ...entry, amount: 0.01 })).amountCents).toBe(1)
    expect((await api.financial.registerPayment(created.id, payment(0.01, "r-min"))).amountCents).toBe(1)
  })

  it("registra os campos alterados, sem valores, e nunca grava valor monetário na auditoria (RN-FIN-011)", async () => {
    login("u-financeiro")
    const created = await api.financial.create(entry)
    await api.financial.update(created.id, { ...entry, amount: 150.5, dueDate: "2999-01-31", description: "Descrição nova e sigilosa" })
    await api.financial.update(created.id, { ...entry, amount: 150.5, dueDate: "2999-01-31", description: "Descrição nova e sigilosa" })
    const paid = await api.financial.registerPayment(created.id, payment(40.25, "r1"))
    await api.financial.reversePayment(paid.id, { reason: "Pix devolvido ao pagador" })

    login("u-admin")
    const trail = auditList({ resource: "financial_entry" }).filter((e) => e.action === "update")
    expect(trail).toHaveLength(2)
    const [latest, previous] = trail
    expect(Object.keys(previous.changes ?? {}).sort()).toEqual(["amountCents", "description", "dueDate"])
    expect(latest.changes).toBeUndefined()
    expect(previous.summary).toMatch(/LAN-0001/)

    // Só o texto e o diff (ids e horários aleatórios ficam de fora para o teste não oscilar).
    const financial = auditList().filter((e) => e.resource.startsWith("financial"))
    expect(financial).toHaveLength(5) // criação, 2 alterações, pagamento e estorno
    const text = JSON.stringify(financial.map((e) => [e.summary, e.changes]))
    for (const leaked of ["10000", "15050", "4025", "150.5", "150,50", "40.25", "40,25", "R$", "sigilosa", "2999-01-31"]) {
      expect(text).not.toContain(leaked)
    }
    expect(Object.values(previous.changes ?? {}).every((c) => c.from === null && c.to === null)).toBe(true)
  })
})

describe("Banco demo — coleções novas", () => {
  it("nasce sem seed clínico nem financeiro (DEMO)", () => {
    const db = getDB()
    for (const key of Object.keys(emptyModules()) as (keyof ReturnType<typeof emptyModules>)[]) expect(db[key]).toEqual([])
    expect(db.counters.financial).toBe(0)
  })

  it("migra bancos salvos antes dos módulos sem perder dados", () => {
    const old = { ...getDB(), counters: { patient: 25 } } as unknown as DemoDB
    for (const key of Object.keys(emptyModules())) delete (old as unknown as Record<string, unknown>)[key]
    const migrated = withModuleDefaults(old)
    expect(migrated.clinicalRecords).toEqual([])
    expect(migrated.counters).toEqual({ patient: 25, financial: 0 })
    expect(migrated.patients).toHaveLength(old.patients.length)
  })
})
