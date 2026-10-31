import { describe, expect, it } from "vitest"

import { goalToStored, recordRoots, recordTypeOf, toAbaGoal, toAbaPlan, toAbaSession, toAssessment, toClinicalRecord, toClinicalRecords } from "../clinical-mappers"

const nameOf = (id?: string) => (id === "u-ana" ? "Ana Prado" : "Usuário da clínica")

// Linhas como o backend devolve: `{ id, ...payload }`.
const original = {
  id: "r1",
  patientId: "p1",
  type: "progress",
  title: "Evolução",
  content: "Paciente colaborativo durante toda a sessão.",
  status: "superseded",
  createdBy: "u-ana",
  authorName: "Ana Prado",
  professionalId: "pr1",
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:30:00.000Z",
  finalizedAt: "2026-03-01T10:30:00.000Z",
}
const rectification = { ...original, id: "r2", status: "finalized", parentId: "r1", version: 2, rectificationReason: "Corrigir a data", createdAt: "2026-03-02T09:00:00.000Z", updatedAt: "2026-03-02T09:20:00.000Z", finalizedAt: "2026-03-02T09:20:00.000Z" }
const draft = { ...original, id: "r3", status: "draft", parentId: "r2", version: 3, finalizedAt: null }

describe("prontuário", () => {
  it("traduz tipo, situação e raiz da cadeia de versões", () => {
    const [a, b, c] = toClinicalRecords([original, rectification, draft], nameOf)
    expect([a.kind, a.status, a.rootId, a.supersededById]).toEqual(["evolution", "rectified", "r1", "r2"])
    expect([b.status, b.rootId, b.rectifiesId, b.version, b.rectificationReason]).toEqual(["finalized", "r1", "r1", 2, "Corrigir a data"])
    expect([c.status, c.rootId, c.rectifiesId, c.finalizedAt]).toEqual(["draft", "r1", "r2", undefined])
  })

  it("recordRoots segue parentId e trata pai ausente e ciclo como raiz", () => {
    const roots = recordRoots([{ id: "a", parentId: "b" }, { id: "b", parentId: "a" }, { id: "c", parentId: "fora" }, { id: "d" }])
    expect(roots.get("c")).toBe("c")
    expect(roots.get("d")).toBe("d")
    expect(["a", "b"]).toContain(roots.get("a"))
  })

  it("autoria vem do payload ou do usuário que criou; o histórico sai das datas gravadas", () => {
    const record = toClinicalRecord({ ...original, authorName: undefined, status: "finalized" }, { nameOf })
    expect(record.authorName).toBe("Ana Prado")
    expect(record.history.map((e) => e.action)).toEqual(["created", "finalized"])
    expect(toClinicalRecord(rectification, { nameOf }).history.map((e) => e.action)).toEqual(["rectification_started", "finalized"])
    const edited = toClinicalRecord({ ...original, status: "draft", finalizedAt: undefined }, { nameOf })
    expect(edited.history.map((e) => e.action)).toEqual(["created", "updated"])
    expect(edited.finalizedAt).toBeUndefined()
  })

  it("registro sem dados opcionais não quebra", () => {
    const record = toClinicalRecord({ id: "x", patientId: "p", type: "anamnesis", status: "draft" }, { nameOf })
    expect(record).toMatchObject({ kind: "anamnesis", version: 1, rootId: "x", content: "", appointmentId: undefined })
  })

  it("o tipo enviado à API é o do backend", () => {
    expect([recordTypeOf("anamnesis"), recordTypeOf("evolution"), recordTypeOf("document")]).toEqual(["anamnesis", "progress", "clinical_document"])
  })
})

describe("avaliações", () => {
  const row = {
    id: "a1",
    patientId: "p1",
    title: "Avaliação inicial",
    purpose: "Entender o perfil",
    responsibleProfessionalId: "pr1",
    status: "completed",
    stages: [
      { id: "s1", name: "Entrevista", status: "completed", doneAt: "2026-03-02T10:00:00.000Z" },
      { id: "s2", name: "Testes", status: "in_progress", doneAt: "2026-03-02T11:00:00.000Z" },
    ],
    interpretations: [{ id: "i1", version: 1, content: "Resultados dentro do esperado para a idade.", createdBy: "u-ana", at: "2026-03-03T10:00:00.000Z" }],
    events: [
      { action: "stages", actor: "u-ana", at: "2026-03-02T10:00:00.000Z" },
      { action: "complete", actor: "u-ana", at: "2026-03-04T10:00:00.000Z" },
    ],
    createdBy: "u-ana",
    createdAt: "2026-03-01T10:00:00.000Z",
  }

  it("traduz etapas concluídas, interpretações e o histórico de eventos", () => {
    const a = toAssessment(row, nameOf)
    expect(a.stages.map((s) => [s.status, s.doneAt])).toEqual([["done", "2026-03-02T10:00:00.000Z"], ["in_progress", undefined]])
    expect(a.interpretations[0]).toMatchObject({ text: "Resultados dentro do esperado para a idade.", authorId: "u-ana", authorName: "Ana Prado" })
    expect(a.history.map((e) => e.summary)).toEqual(["Avaliação aberta", "Etapa atualizada", "Avaliação concluída"])
    expect(a.completedAt).toBe("2026-03-04T10:00:00.000Z")
    expect(a.updatedAt).toBe("2026-03-04T10:00:00.000Z")
  })

  it("avaliação pendente na API aparece como em andamento e o cancelamento traz o motivo", () => {
    expect(toAssessment({ ...row, status: "pending", events: [] }, nameOf)).toMatchObject({ status: "in_progress", completedAt: undefined })
    expect(toAssessment({ ...row, status: "cancelled", cancelReason: "Paciente desistiu" }, nameOf)).toMatchObject({ status: "cancelled", cancelReason: "Paciente desistiu" })
  })
})

describe("ABA", () => {
  it("objetivo usa criteria da API, e completed vira alcançado", () => {
    expect(toAbaGoal({ id: "g1", criteria: "Responder ao nome em 8 de 10 tentativas", targetPercent: 80, consecutiveSessions: 3, status: "completed", progress: 90 })).toMatchObject({
      criterionText: "Responder ao nome em 8 de 10 tentativas",
      title: "Responder ao nome em 8 de 10 tentativas",
      status: "achieved",
    })
    expect(toAbaGoal({ id: "g2", title: "Contato visual", criterionText: "Manter contato visual por 3 segundos", criteria: "x", status: "discontinued", statusReason: "Meta trocada" })).toMatchObject({
      title: "Contato visual",
      criterionText: "Manter contato visual por 3 segundos",
      status: "discontinued",
      statusReason: "Meta trocada",
    })
  })

  it("goalToStored envia criteria (exigido pela API) e criterionText (nome da UI)", () => {
    expect(goalToStored({ title: "T", description: undefined, criterionText: "Critério explícito", targetPercent: 80, consecutiveSessions: 3 })).toMatchObject({
      criteria: "Critério explícito",
      criterionText: "Critério explícito",
    })
  })

  it("plano traz objetivos e histórico gravados", () => {
    const plan = toAbaPlan({
      id: "pl1",
      patientId: "p1",
      title: "Plano 1",
      startDate: "2026-03-01",
      responsibleProfessionalId: "pr1",
      status: "closed",
      closeReason: "Alta",
      goals: [{ id: "g1", criteria: "Critério explícito aqui", targetPercent: 80, consecutiveSessions: 2, status: "active" }],
      changeLog: [{ at: "2026-03-01T10:00:00.000Z", actorId: "u-ana", actorName: "Ana Prado", summary: "Plano criado", voidedSessionId: "s9" }],
      createdAt: "2026-03-01T10:00:00.000Z",
    })
    expect(plan).toMatchObject({ status: "closed", closeReason: "Alta", reviewDate: undefined, updatedAt: "2026-03-01T10:00:00.000Z" })
    expect(plan.changeLog).toEqual([{ at: "2026-03-01T10:00:00.000Z", actorId: "u-ana", actorName: "Ana Prado", summary: "Plano criado", changes: undefined }])
  })

  it("sessão anulada carrega motivo; sessão válida não", () => {
    const base = { id: "s1", planId: "pl1", patientId: "p1", date: "2026-03-05", professionalId: "pr1", createdBy: "u-ana", authorName: "Ana Prado", measures: [{ goalId: "g1", trials: 10, correct: 8, percent: 80, note: "" }], createdAt: "2026-03-05T10:00:00.000Z" }
    expect(toAbaSession(base, nameOf)).toMatchObject({ authorId: "u-ana", voidedAt: undefined, measures: [{ goalId: "g1", trials: 10, correct: 8, note: undefined }] })
    expect(toAbaSession({ ...base, voided: true, voidReason: "Lançada no paciente errado" }, nameOf)).toMatchObject({ voidedAt: base.createdAt, voidReason: "Lançada no paciente errado" })
  })
})
