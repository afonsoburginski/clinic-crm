import { describe, expect, it } from "vitest"

import { ForbiddenError, ValidationError } from "@/domain/errors"

import { api } from "../api"
import { callsTo, denied, installFakeApi, reply, routes, signInAs, calls } from "./support/fake-api"

// Adaptadores de prontuário, avaliações e ABA contra a API Hono simulada.
installFakeApi()

const pro = () => signInAs(["professional"], { professionalId: "pr1" })

const record = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  patientId: "p1",
  type: "progress",
  title: "Evolução",
  content: "Paciente colaborativo durante toda a sessão de hoje.",
  status: "finalized",
  createdBy: "u1",
  authorName: "Marina Alves",
  professionalId: "pr1",
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
  ...over,
})

describe("prontuário", () => {
  it("lista os registros do paciente pela API, filtra o tipo no cliente e ordena do mais novo", async () => {
    pro()
    routes["GET /clinical-records"] = (call: { search: URLSearchParams }) => {
      expect(call.search.get("patientId")).toBe("p1")
      return { items: [record(), record({ id: "r2", type: "anamnesis", createdAt: "2026-03-05T10:00:00.000Z" })] }
    }
    expect((await api.clinicalRecords.list("p1")).map((r) => r.id)).toEqual(["r2", "r1"])
    expect((await api.clinicalRecords.list("p1", { kind: "evolution" })).map((r) => r.id)).toEqual(["r1"])
  })

  it("perfil sem acesso recebe mensagem clara", async () => {
    signInAs(["reception"])
    routes["GET /clinical-records"] = denied
    await expect(api.clinicalRecords.list("p1")).rejects.toThrow(ForbiddenError)
    await expect(api.clinicalRecords.list("p1")).rejects.toThrow(/acesso ao prontuário/)
  })

  it("patients junta os registros da API aos pacientes do profissional", async () => {
    pro()
    routes["GET /patients"] = { items: [{ id: "p1", code: "1", fullName: "Ana Souza", birthDate: "2019-05-10T00:00:00.000Z", status: "active" }, { id: "p2", code: "2", fullName: "Bruno Lima", birthDate: "2018-01-01T00:00:00.000Z", status: "active" }] }
    routes["GET /clinical/patients"] = { items: [record(), record({ id: "r2", status: "draft", updatedAt: "2026-03-09T10:00:00.000Z" })] }
    const rows = await api.clinicalRecords.patients()
    expect(rows.map((r) => [r.patient.id, r.total, r.drafts, r.lastAt])).toEqual([
      ["p1", 2, 1, "2026-03-09T10:00:00.000Z"],
      ["p2", 0, 0, undefined],
    ])
  })

  it("get de uma retificação resolve a raiz pela cadeia de versões", async () => {
    pro()
    const r2 = record({ id: "r2", status: "draft", parentId: "r1", version: 2 })
    routes["GET /clinical-records/r2"] = r2
    routes["GET /clinical-records/r2/versions"] = { items: [record({ status: "superseded" }), r2] }
    expect(await api.clinicalRecords.get("r2")).toMatchObject({ id: "r2", rootId: "r1", rectifiesId: "r1", version: 2 })
  })

  it("create envia o tipo da API, a autoria e as datas; só profissional registra", async () => {
    signInAs(["reception"])
    await expect(api.clinicalRecords.create("p1", { kind: "anamnesis", title: "Anamnese", content: "", appointmentId: "" })).rejects.toThrow(ForbiddenError)
    expect(calls).toHaveLength(0)

    pro()
    routes["POST /clinical-records"] = (call: { body: Record<string, unknown> }) => ({ id: "r9", status: "draft", createdBy: "u1", ...call.body })
    const created = await api.clinicalRecords.create("p1", { kind: "evolution", title: "Evolução", content: "Rascunho", appointmentId: "" })
    expect(callsTo("POST /clinical-records")[0].body).toMatchObject({ patientId: "p1", type: "progress", title: "Evolução", authorName: "Marina Alves", professionalId: "pr1" })
    expect(callsTo("POST /clinical-records")[0].body.createdAt).toBe(callsTo("POST /clinical-records")[0].body.updatedAt)
    expect(created).toMatchObject({ id: "r9", kind: "evolution", status: "draft", authorId: "u1" })
  })

  it("evolução só vincula atendimento do próprio paciente e profissional (RN-PRN-009)", async () => {
    pro()
    routes["GET /patients/p1/appointments"] = { items: [{ id: "ap-1", professionalId: "outro", start: "2026-03-01T10:00:00.000Z", end: "2026-03-01T11:00:00.000Z", status: "completed" }] }
    await expect(api.clinicalRecords.create("p1", { kind: "evolution", title: "Evolução", content: "x", appointmentId: "ap-1" })).rejects.toThrow(/não pertence/)
    expect(callsTo("POST /clinical-records")).toHaveLength(0)
  })

  it("finalizar carimba o rascunho antes de finalizar e, em retificação, revoga as liberações do documento", async () => {
    pro()
    const r2 = record({ id: "r2", status: "draft", parentId: "r1", version: 2 })
    routes["GET /clinical-records/r2"] = r2
    routes["GET /clinical-records/r2/versions"] = { items: [record({ status: "finalized" }), r2] }
    routes["GET /clinical-records/r1"] = record()
    routes["PATCH /clinical-records/r2"] = { ...r2, finalizedAt: "x" }
    routes["POST /clinical-records/r2/finalize"] = { ...r2, status: "finalized", finalizedAt: "2026-03-02T09:00:00.000Z" }
    routes["GET /documents"] = { items: [{ id: "d1", patientId: "p1", title: "Laudo", classification: "clinical", clinicalRecordId: "r1", status: "issued", releases: [{ id: "rl1", guardianId: "g1", active: true, createdBy: "u1", createdAt: "2026-03-03T10:00:00.000Z" }, { id: "rl2", guardianId: "g2", active: false, revokedAt: "2026-03-04T10:00:00.000Z" }] }] }
    routes["POST /documents/d1/releases/rl1/revoke"] = { id: "d1" }

    const finalized = await api.clinicalRecords.finalize("r2")

    expect(finalized).toMatchObject({ status: "finalized", rootId: "r1" })
    const order = calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`)
    expect(order).toEqual(["PATCH /clinical-records/r2", "POST /clinical-records/r2/finalize", "POST /documents/d1/releases/rl1/revoke"])
    expect(callsTo("PATCH /clinical-records/r2")[0].body.finalizedAt).toBe(callsTo("PATCH /clinical-records/r2")[0].body.updatedAt)
    expect(callsTo("POST /documents/d1/releases/rl1/revoke")[0].body).toEqual({ reason: "Registro clínico retificado" })
  })

  it("só o autor finaliza: outro profissional é barrado antes de chamar a API", async () => {
    signInAs(["professional"], { id: "u-outro", professionalId: "pr2" })
    routes["GET /clinical-records/r1"] = record({ status: "draft" })
    await expect(api.clinicalRecords.finalize("r1")).rejects.toThrow(ForbiddenError)
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0)
  })

  it("retificar cria a nova versão e troca autoria e datas herdadas do original", async () => {
    pro()
    routes["GET /clinical-records/r1"] = record()
    routes["GET /clinical-records/r1/versions"] = { items: [record()] }
    routes["POST /clinical-records/r1/rectifications"] = record({ id: "r2", status: "draft", parentId: "r1", version: 2 })
    routes["PATCH /clinical-records/r2"] = (call: { body: Record<string, unknown> }) => record({ id: "r2", status: "draft", parentId: "r1", version: 2, ...call.body })

    const draft = await api.clinicalRecords.rectify("r1", { reason: "Corrigir a data da sessão" })

    expect(callsTo("POST /clinical-records/r1/rectifications")[0].body).toEqual({ reason: "Corrigir a data da sessão" })
    expect(callsTo("PATCH /clinical-records/r2")[0].body).toMatchObject({ finalizedAt: null, authorName: "Marina Alves" })
    expect(draft).toMatchObject({ id: "r2", rootId: "r1", rectifiesId: "r1", status: "draft", finalizedAt: undefined })
    await expect(api.clinicalRecords.rectify("r1", { reason: "curto" })).rejects.toThrow(ValidationError)
  })
})

const assessment = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  patientId: "p1",
  title: "Avaliação inicial",
  purpose: "Entender o perfil",
  responsibleProfessionalId: "pr1",
  status: "in_progress",
  stages: [{ id: "s1", name: "Entrevista", status: "in_progress" }],
  interpretations: [],
  events: [],
  createdBy: "u1",
  createdAt: "2026-03-01T10:00:00.000Z",
  ...over,
})

describe("avaliações", () => {
  it("abrir envia etapas com id e situação inicial; o responsável não é checado por quem não lê o catálogo", async () => {
    pro()
    routes["GET /professionals/pr1"] = denied
    routes["POST /assessments"] = (call: { body: Record<string, unknown> }) => ({ id: "a9", createdBy: "u1", ...call.body })
    const created = await api.assessments.create({ patientId: "p1", title: "Avaliação inicial", purpose: "Entender o perfil", responsibleProfessionalId: "pr1", stages: ["Entrevista", "Testes"] })
    const body = callsTo("POST /assessments")[0].body
    expect(body).toMatchObject({ patientId: "p1", status: "in_progress", createdByName: "Marina Alves" })
    expect(body.stages.map((s: { name: string; status: string }) => [s.name, s.status])).toEqual([["Entrevista", "pending"], ["Testes", "pending"]])
    expect(created.stages).toHaveLength(2)
  })

  it("responsável inativo é recusado quando o catálogo está acessível", async () => {
    pro()
    routes["GET /professionals/pr1"] = { id: "pr1", name: "Dra. Helena", active: false, specialtyIds: ["sp1"] }
    routes["GET /patients/p1"] = { id: "p1", code: "1", fullName: "Ana Souza", birthDate: "2019-05-10T00:00:00.000Z", status: "active" }
    routes["GET /patients/p1/appointments"] = { items: [] }
    await expect(api.assessments.create({ patientId: "p1", title: "Avaliação inicial", purpose: "Entender o perfil", responsibleProfessionalId: "pr1", stages: ["Entrevista"] })).rejects.toThrow(/responsável ativo/)
    expect(callsTo("POST /assessments")).toHaveLength(0)
  })

  it("concluir etapa grava a data de conclusão junto da etapa", async () => {
    pro()
    routes["GET /assessments/a1"] = assessment()
    routes["POST /assessments/a1/stages"] = assessment({ stages: [{ id: "s1", name: "Entrevista", status: "completed", updatedBy: "u1" }] })
    routes["PATCH /assessments/a1"] = (call: { body: Record<string, unknown> }) => assessment({ stages: call.body.stages })

    const updated = await api.assessments.setStage("a1", "s1", "done")

    expect(callsTo("POST /assessments/a1/stages")[0].body).toEqual({ stageId: "s1", status: "completed" })
    expect(callsTo("PATCH /assessments/a1")[0].body.patientId).toBe("p1")
    expect(updated.stages[0]).toMatchObject({ status: "done", doneAt: expect.any(String) })
  })

  it("transição de etapa inválida é barrada antes da chamada", async () => {
    pro()
    routes["GET /assessments/a1"] = assessment({ stages: [{ id: "s1", name: "Entrevista", status: "completed" }] })
    await expect(api.assessments.setStage("a1", "s1", "pending")).rejects.toThrow(ValidationError)
    expect(callsTo("POST /assessments/a1/stages")).toHaveLength(0)
  })

  it("só o responsável conclui ou cancela", async () => {
    signInAs(["professional"], { id: "u2", professionalId: "pr2" })
    routes["GET /assessments/a1"] = assessment({ stages: [{ id: "s1", name: "E", status: "completed" }], interpretations: [{ id: "i1", version: 1, content: "x".repeat(25), createdBy: "u1", at: "2026-03-02T10:00:00.000Z" }] })
    await expect(api.assessments.complete("a1")).rejects.toThrow(ForbiddenError)
    await expect(api.assessments.cancel("a1", { reason: "Paciente desistiu" })).rejects.toThrow(ForbiddenError)
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0)
  })

  it("cancelar envia o motivo e devolve a avaliação cancelada", async () => {
    pro()
    routes["GET /assessments/a1"] = assessment()
    routes["POST /assessments/a1/cancel"] = assessment({ status: "cancelled", cancelReason: "Paciente desistiu" })
    expect(await api.assessments.cancel("a1", { reason: "Paciente desistiu" })).toMatchObject({ status: "cancelled", cancelReason: "Paciente desistiu" })
    expect(callsTo("POST /assessments/a1/cancel")[0].body).toEqual({ reason: "Paciente desistiu" })
  })

  it("interpretação enviada como `content` volta como `text`", async () => {
    pro()
    const text = "Resultados dentro do esperado para a idade do paciente."
    routes["GET /assessments/a1"] = assessment()
    routes["POST /assessments/a1/interpretations"] = assessment({ interpretations: [{ id: "i1", version: 1, content: text, createdBy: "u1", at: "2026-03-02T10:00:00.000Z" }] })
    const updated = await api.assessments.saveInterpretation("a1", { text })
    expect(callsTo("POST /assessments/a1/interpretations")[0].body).toEqual({ content: text })
    expect(updated.interpretations[0]).toMatchObject({ text, authorName: "Marina Alves" })
  })
})

const goal = (over: Record<string, unknown> = {}) => ({ id: "g1", title: "Resposta ao nome", criteria: "Responder ao nome em 8 de 10 tentativas", criterionText: "Responder ao nome em 8 de 10 tentativas", targetPercent: 80, consecutiveSessions: 2, status: "active", progress: 0, ...over })
const plan = (over: Record<string, unknown> = {}) => ({
  id: "pl1",
  patientId: "p1",
  title: "Plano 1",
  startDate: "2026-03-01",
  responsibleProfessionalId: "pr1",
  status: "active",
  goals: [goal()],
  changeLog: [{ at: "2026-03-01T10:00:00.000Z", actorId: "u1", actorName: "Marina Alves", summary: "Plano criado" }],
  createdBy: "u1",
  createdAt: "2026-03-01T10:00:00.000Z",
  ...over,
})
const session = (over: Record<string, unknown> = {}) => ({
  id: "se1",
  planId: "pl1",
  patientId: "p1",
  date: "2026-03-05",
  professionalId: "pr1",
  createdBy: "u1",
  authorName: "Marina Alves",
  measures: [{ goalId: "g1", trials: 10, correct: 9, percent: 90 }],
  createdAt: "2026-03-05T10:00:00.000Z",
  ...over,
})

describe("ABA", () => {
  it("o plano traz as sessões do plano e o progresso só das medidas registradas", async () => {
    pro()
    routes["GET /aba/plans/pl1"] = plan()
    routes["GET /aba/sessions"] = { items: [session(), session({ id: "outro", planId: "pl2" })] }
    const view = await api.aba.getPlan("pl1")
    expect(callsTo("GET /aba/sessions")[0].search.get("patientId")).toBe("p1")
    expect(view.sessions.map((s) => s.id)).toEqual(["se1"])
    expect(view.progress[0]).toMatchObject({ lastPercent: 90, state: "in_progress" })
  })

  it("sem sessões o progresso é 'sem dados', nunca zero (RN-ABA-004)", async () => {
    pro()
    routes["GET /aba/plans/pl1"] = plan()
    routes["GET /aba/sessions"] = { items: [] }
    expect((await api.aba.getPlan("pl1")).progress[0]).toMatchObject({ lastPercent: null, state: "no_data" })
  })

  it("criar plano nasce em rascunho, com histórico, e exige responsável quando o catálogo está acessível", async () => {
    pro()
    routes["GET /professionals/pr1"] = denied
    routes["POST /aba/plans"] = (call: { body: Record<string, unknown> }) => ({ id: "pl9", createdBy: "u1", ...call.body })
    const created = await api.aba.createPlan({ patientId: "p1", title: "Plano 1", startDate: "2026-03-01", reviewDate: "", responsibleProfessionalId: "pr1" })
    expect(callsTo("POST /aba/plans")[0].body).toMatchObject({ status: "draft", goals: [] })
    expect(created).toMatchObject({ status: "draft", reviewDate: undefined })
    expect(created.changeLog.map((c) => c.summary)).toEqual(["Plano criado"])
  })

  it("adicionar objetivo usa a rota da API (critério validado lá) e registra no histórico", async () => {
    pro()
    routes["GET /aba/plans/pl1"] = plan({ goals: [] })
    routes["GET /aba/sessions"] = { items: [] }
    routes["POST /aba/plans/pl1/goals"] = plan()
    routes["PATCH /aba/plans/pl1"] = (call: { body: Record<string, unknown> }) => plan({ changeLog: call.body.changeLog })
    const updated = await api.aba.saveGoal("pl1", { title: "Resposta ao nome", description: "", criterionText: "Responder ao nome em 8 de 10 tentativas", targetPercent: 80, consecutiveSessions: 2 })
    expect(callsTo("POST /aba/plans/pl1/goals")[0].body).toMatchObject({ criteria: "Responder ao nome em 8 de 10 tentativas", targetPercent: 80 })
    expect(updated.changeLog.at(-1)?.summary).toBe("Objetivo adicionado: Resposta ao nome")
    await expect(api.aba.saveGoal("pl1", { title: "Curto", description: "", criterionText: "pouco", targetPercent: 80, consecutiveSessions: 2 })).rejects.toThrow(ValidationError)
  })

  it("objetivo alcançado exige o critério atingido pelas medidas (RN-ABA-006)", async () => {
    pro()
    routes["GET /aba/plans/pl1"] = plan()
    routes["GET /aba/sessions"] = { items: [session({ measures: [{ goalId: "g1", trials: 10, correct: 5, percent: 50 }] })] }
    await expect(api.aba.setGoalStatus("pl1", "g1", { to: "achieved", reason: "" })).rejects.toThrow(/critério/)
    routes["PATCH /aba/plans/pl1"] = (call: { body: Record<string, unknown> }) => plan({ goals: call.body.goals, changeLog: call.body.changeLog })
    const updated = await api.aba.setGoalStatus("pl1", "g1", { to: "discontinued", reason: "Meta substituída" })
    expect(updated.goals[0]).toMatchObject({ status: "discontinued", statusReason: "Meta substituída" })
    expect(callsTo("PATCH /aba/plans/pl1")[0].body.goals[0].criteria).toBe("Responder ao nome em 8 de 10 tentativas")
  })

  it("encerrar grava motivo e histórico antes de fechar o plano", async () => {
    pro()
    routes["GET /aba/plans/pl1"] = plan()
    routes["GET /aba/sessions"] = { items: [] }
    routes["PATCH /aba/plans/pl1"] = plan()
    routes["POST /aba/plans/pl1/close"] = plan({ status: "closed", closeReason: "Alta do paciente" })
    const closed = await api.aba.closePlan("pl1", { reason: "Alta do paciente" })
    expect(calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`)).toEqual(["PATCH /aba/plans/pl1", "POST /aba/plans/pl1/close"])
    expect(callsTo("PATCH /aba/plans/pl1")[0].body).toMatchObject({ closeReason: "Alta do paciente" })
    expect(closed).toMatchObject({ status: "closed", closeReason: "Alta do paciente" })
  })

  it("registrar sessão envia o percentual e só vale em plano ativo", async () => {
    pro()
    routes["GET /aba/plans/pl1"] = plan({ status: "draft" })
    routes["GET /aba/sessions"] = { items: [] }
    const input = { planId: "pl1", date: "2026-03-05", notes: "", measures: [{ goalId: "g1", trials: 10, correct: 8, note: "" }] }
    await expect(api.aba.recordSession(input)).rejects.toThrow(/planos ativos/)

    routes["GET /aba/plans/pl1"] = plan()
    routes["POST /aba/sessions"] = (call: { body: Record<string, unknown> }) => ({ id: "se9", createdBy: "u1", ...call.body })
    routes["PATCH /aba/plans/pl1"] = plan()
    const created = await api.aba.recordSession(input)
    expect(callsTo("POST /aba/sessions")[0].body).toMatchObject({ planId: "pl1", patientId: "p1", professionalId: "pr1", measures: [{ goalId: "g1", trials: 10, correct: 8, percent: 80 }] })
    expect(callsTo("PATCH /aba/plans/pl1")[0].body.changeLog.at(-1).summary).toBe("Sessão de 05/03/2026 registrada")
    expect(created).toMatchObject({ id: "se9", authorName: "Marina Alves" })
  })

  it("anular localiza a sessão, grava o fato no histórico do plano e a data aparece na leitura seguinte", async () => {
    pro()
    routes["GET /aba/sessions"] = { items: [session()] }
    routes["GET /aba/plans/pl1"] = plan()
    routes["POST /aba/sessions/se1/void"] = session({ voided: true, voidReason: "Lançada no paciente errado" })
    routes["PATCH /aba/plans/pl1"] = plan()
    const voided = await api.aba.voidSession("se1", { reason: "Lançada no paciente errado" })
    expect(callsTo("POST /aba/sessions/se1/void")[0].body).toEqual({ reason: "Lançada no paciente errado" })
    const logged = callsTo("PATCH /aba/plans/pl1")[0].body.changeLog.at(-1)
    expect(logged).toMatchObject({ summary: "Sessão de 05/03/2026 anulada", voidedSessionId: "se1" })
    expect(voided.voidReason).toBe("Lançada no paciente errado")

    routes["GET /aba/plans/pl1"] = plan({ changeLog: [logged] })
    routes["GET /aba/sessions"] = { items: [session({ voided: true, voidReason: "Lançada no paciente errado" })] }
    const view = await api.aba.getPlan("pl1")
    expect(view.sessions[0].voidedAt).toBe(logged.at)
    expect(view.progress[0].state).toBe("no_data")
  })

  it("anular sessão de plano encerrado é recusado", async () => {
    pro()
    routes["GET /aba/sessions"] = { items: [session()] }
    routes["GET /aba/plans/pl1"] = plan({ status: "closed" })
    await expect(api.aba.voidSession("se1", { reason: "Motivo válido" })).rejects.toThrow(/somente leitura/)
    expect(callsTo("POST /aba/sessions/se1/void")).toHaveLength(0)
  })

  it("lista de planos passa o filtro de situação à API", async () => {
    pro()
    routes["GET /aba/plans"] = (call: { search: URLSearchParams }) => {
      expect(call.search.get("status")).toBe("active")
      return { items: [plan(), plan({ id: "pl2", createdAt: "2026-04-01T10:00:00.000Z" })] }
    }
    expect((await api.aba.listPlans({ status: "active" })).map((p) => p.id)).toEqual(["pl2", "pl1"])
    routes["GET /aba/plans"] = reply(403, { error: { code: "forbidden", message: "forbidden" } })
    await expect(api.aba.listPlans({})).rejects.toThrow(ForbiddenError)
  })
})
