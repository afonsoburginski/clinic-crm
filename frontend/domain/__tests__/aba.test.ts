import { describe, expect, it } from "vitest"

import {
  activatePlan,
  closePlan,
  createPlan,
  goalProgress,
  measurePercent,
  saveGoal,
  setGoalStatus,
  validateSession,
  voidSession,
} from "../aba"
import { ValidationError } from "../errors"
import type { AbaGoal, AbaGoalStatus, AbaPlan, AbaSession, User } from "../types"

const user: User = { id: "u1", name: "Camila", email: "c@t.com", title: "", roles: ["professional"], professionalId: "p1" }
const T = "2026-03-01T10:00:00.000Z"

const GOAL = {
  title: "Pedir ajuda",
  criterionText: "80% de acertos em 3 sessões consecutivas",
  targetPercent: 80,
  consecutiveSessions: 3,
}

const base = () => createPlan({ id: "pl1", patientId: "pa-1", title: "Plano 2026", startDate: "2026-03-01", responsibleProfessionalId: "p1" }, user, T)
const withGoal = () => saveGoal(base(), GOAL, undefined, "g1", user, T)
const active = () => activatePlan(withGoal(), user, T)

const goal: AbaGoal = { id: "g1", ...GOAL, status: "active" }

let seq = 0
const session = (date: string, correct: number, trials = 10, extra: Partial<AbaSession> = {}): AbaSession => ({
  id: `s${++seq}`,
  planId: "pl1",
  patientId: "pa-1",
  date,
  professionalId: "p1",
  authorId: "u1",
  authorName: "Camila",
  measures: [{ goalId: "g1", trials, correct }],
  createdAt: `${date}T12:00:00.000Z`,
  ...extra,
})

describe("ABA — progresso só de medidas reais (RN-ABA-004/005)", () => {
  it("sem medidas, o percentual é null e o estado é 'sem dados' (CA-ABA-001)", () => {
    const p = goalProgress(goal, [])
    expect(p).toMatchObject({ lastPercent: null, criterionMet: false, state: "no_data" })
    expect(p.points).toEqual([])
  })

  it("não considera sessões de outros objetivos", () => {
    const other = session("2026-03-02", 9, 10, { measures: [{ goalId: "g2", trials: 10, correct: 9 }] })
    expect(goalProgress(goal, [other]).state).toBe("no_data")
  })

  it("calcula percentual a partir de tentativas e acertos", () => {
    expect(measurePercent({ trials: 8, correct: 7 })).toBe(87.5)
    expect(goalProgress(goal, [session("2026-03-02", 7, 8)]).lastPercent).toBe(87.5)
  })

  it("critério usa as últimas N medidas consecutivas (CA-ABA-002)", () => {
    const sessions = [session("2026-03-02", 9), session("2026-03-03", 7), session("2026-03-04", 17, 20), session("2026-03-05", 9)]
    // 90, 70, 85, 90 -> as últimas 3 (70, 85, 90) falham por causa do 70
    expect(goalProgress(goal, sessions).criterionMet).toBe(false)
    const met = [session("2026-03-02", 9), session("2026-03-03", 8), session("2026-03-04", 9), session("2026-03-05", 10)]
    // 90, 80, 90, 100 -> as últimas 3 (80, 90, 100) são todas >= 80
    const p = goalProgress(goal, met)
    expect(p.criterionMet).toBe(true)
    expect(p.state).toBe("criterion_met")
  })

  it("exige ao menos N medidas mesmo com 100%", () => {
    expect(goalProgress(goal, [session("2026-03-02", 10), session("2026-03-03", 10)]).criterionMet).toBe(false)
  })

  it("ordena por data, não pela ordem de inserção", () => {
    const p = goalProgress(goal, [session("2026-03-09", 10), session("2026-03-02", 1)])
    expect(p.lastPercent).toBe(100)
  })

  it("ignora sessão anulada (CA-ABA-004)", () => {
    const voided = voidSession(session("2026-03-05", 1), "Registrada no paciente errado", user, T)
    const p = goalProgress(goal, [session("2026-03-02", 9), voided])
    expect(p.points).toHaveLength(1)
    expect(p.lastPercent).toBe(90)
  })
})

describe("ABA — plano e objetivos (RN-ABA-001/002/007/008)", () => {
  it("não ativa plano sem objetivo", () => {
    expect(() => activatePlan(base(), user, T)).toThrow(/objetivo/)
  })

  it("exige critério explícito em todo objetivo", () => {
    expect(() => saveGoal(base(), { ...GOAL, criterionText: "ok" }, undefined, "g1", user, T)).toThrow(/critério/)
    expect(() => saveGoal(base(), { ...GOAL, targetPercent: 0 }, undefined, "g1", user, T)).toThrow(ValidationError)
  })

  it("registra autor, data e campos no histórico (só acréscimo)", () => {
    const plan = withGoal()
    const edited = saveGoal(plan, { ...GOAL, targetPercent: 90 }, "g1", "x", user, "2026-03-02T10:00:00.000Z")
    expect(plan.changeLog).toHaveLength(2)
    expect(edited.changeLog).toHaveLength(3)
    expect(edited.changeLog[2]).toMatchObject({
      actorId: "u1",
      at: "2026-03-02T10:00:00.000Z",
      changes: { targetPercent: { from: 80, to: 90 } },
    })
  })

  it("plano encerrado é somente leitura", () => {
    const closed = closePlan(active(), "Alta do paciente", user, T)
    expect(closed.status).toBe("closed")
    expect(() => saveGoal(closed, GOAL, undefined, "g2", user, T)).toThrow(/somente leitura/)
    expect(() => closePlan(closed, "De novo", user, T)).toThrow(ValidationError)
  })
})

describe("ABA — objetivo alcançado só com evidência (RN-ABA-006)", () => {
  it("recusa 'alcançado' sem critério atingido (CA-ABA-003)", () => {
    expect(() => setGoalStatus(active(), "g1", "achieved", "", [session("2026-03-02", 10)], user, T)).toThrow(/critério/)
  })

  it("aceita quando as medidas atingem o critério", () => {
    const sessions = [session("2026-03-02", 8), session("2026-03-03", 9), session("2026-03-04", 10)]
    const plan = setGoalStatus(active(), "g1", "achieved", "", sessions, user, T)
    expect(plan.goals[0].status).toBe("achieved")
  })

  it("descontinuar exige motivo", () => {
    expect(() => setGoalStatus(active(), "g1", "discontinued", "", [], user, T)).toThrow(/motivo/)
    const plan = setGoalStatus(active(), "g1", "discontinued", "Objetivo não funcional agora", [], user, T)
    expect(plan.goals[0]).toMatchObject({ status: "discontinued", statusReason: "Objetivo não funcional agora" })
  })

  it("o motivo entra no histórico junto com a mudança de situação", () => {
    const plan = setGoalStatus(active(), "g1", "discontinued", "Objetivo não funcional agora", [], user, T)
    expect(plan.changeLog.at(-1)?.changes).toEqual({
      status: { from: "active", to: "discontinued" },
      statusReason: { from: undefined, to: "Objetivo não funcional agora" },
    })
  })
})

describe("ABA — estado terminal é definitivo (RN-ABA-006)", () => {
  const met = [session("2026-03-02", 8), session("2026-03-03", 9), session("2026-03-04", 10)]
  const discontinued = () => setGoalStatus(active(), "g1", "discontinued", "Objetivo não funcional agora", [], user, T)
  const achieved = () => setGoalStatus(active(), "g1", "achieved", "Critério atingido nas três sessões", met, user, T)

  it("só objetivo ativo muda, e apenas para alcançado ou descontinuado", () => {
    expect(() => setGoalStatus(active(), "g1", "active", "", [], user, T)).toThrow(/já está/)
    expect(() => setGoalStatus(active(), "g1", "paused" as AbaGoalStatus, "x", [], user, T)).toThrow(/alcançado ou descontinuado/)
  })

  it.each([
    ["descontinuado", discontinued],
    ["alcançado", achieved],
  ])("objetivo %s não é reativado nem alterado", (_, build) => {
    const plan = build()
    const snapshot = structuredClone(plan)
    const status = plan.goals[0].status
    expect(plan.goals[0].statusReason).toBeTruthy()
    expect(() => setGoalStatus(plan, "g1", "active", "Reativando", met, user, T)).toThrow(/definitivo/)
    expect(() => setGoalStatus(plan, "g1", status === "achieved" ? "discontinued" : "achieved", "Outro motivo qualquer", met, user, T)).toThrow(/definitivo/)
    expect(() => setGoalStatus(plan, "g1", status, "Mesmo estado", met, user, T)).toThrow(/já está/)
    // Nada mudou: situação, motivo e histórico permanecem.
    expect(plan).toEqual(snapshot)
    expect(plan.changeLog.at(-1)?.summary).toMatch(/→/)
  })

  it("objetivo terminal também não pode ser editado", () => {
    expect(() => saveGoal(discontinued(), { ...GOAL, title: "Outro" }, "g1", "x", user, T)).toThrow(/não pode ser editado/)
  })
})

describe("ABA — meta não baixa depois de medidas (RN-ABA-010)", () => {
  const measured = [session("2026-03-02", 9)]
  const edit = (fields: Partial<typeof GOAL>, sessions = measured) => saveGoal(withGoal(), { ...GOAL, ...fields }, "g1", "x", user, T, sessions)

  it("com medidas, recusa reduzir a meta em % ou as sessões consecutivas", () => {
    expect(() => edit({ targetPercent: 70 })).toThrow(/não podem ser reduzidas/)
    expect(() => edit({ consecutiveSessions: 2 })).toThrow(/não podem ser reduzidas/)
  })

  it("com medidas, aceita manter ou aumentar a meta e editar o texto", () => {
    expect(edit({ targetPercent: 80, criterionText: "80% de acertos em 3 sessões consecutivas, com apoio" }).goals[0].criterionText).toMatch(/com apoio/)
    expect(edit({ targetPercent: 90, consecutiveSessions: 4 }).goals[0]).toMatchObject({ targetPercent: 90, consecutiveSessions: 4 })
  })

  it("sem medidas, ou só com sessões anuladas ou de outro objetivo, a meta pode baixar", () => {
    expect(edit({ targetPercent: 70 }, []).goals[0].targetPercent).toBe(70)
    const voided = voidSession(session("2026-03-02", 9), "Lançada por engano", user, T)
    expect(edit({ targetPercent: 70 }, [voided]).goals[0].targetPercent).toBe(70)
    const other = session("2026-03-02", 9, 10, { measures: [{ goalId: "g2", trials: 10, correct: 9 }] })
    expect(edit({ targetPercent: 70 }, [other]).goals[0].targetPercent).toBe(70)
  })
})

describe("ABA — sessões (RN-ABA-003)", () => {
  const today = "2026-03-10"
  const ok = { date: "2026-03-09", measures: [{ goalId: "g1", trials: 10, correct: 8 }] }

  it("só em plano ativo", () => {
    expect(() => validateSession(withGoal(), ok, today)).toThrow(/ativos/)
  })

  it("recusa data futura, medidas vazias e objetivo desconhecido", () => {
    expect(() => validateSession(active(), { ...ok, date: "2026-03-11" }, today)).toThrow(/futura/)
    expect(() => validateSession(active(), { ...ok, measures: [] }, today)).toThrow(/ao menos uma medida/)
    expect(() => validateSession(active(), { ...ok, measures: [{ goalId: "zz", trials: 5, correct: 1 }] }, today)).toThrow(/inexistente/)
  })

  it("recusa acertos fora de 0..tentativas e objetivo repetido", () => {
    expect(() => validateSession(active(), { ...ok, measures: [{ goalId: "g1", trials: 5, correct: 6 }] }, today)).toThrow(/entre 0/)
    expect(() => validateSession(active(), { ...ok, measures: [{ goalId: "g1", trials: 0, correct: 0 }] }, today)).toThrow(/tentativa/)
    const twice = { ...ok, measures: [ok.measures[0], ok.measures[0]] }
    expect(() => validateSession(active(), twice, today)).toThrow(/mais de uma/)
  })

  it("aceita sessão válida", () => {
    expect(() => validateSession(active(), ok, today)).not.toThrow()
  })

  it("anulação exige motivo e não se repete", () => {
    expect(() => voidSession(session("2026-03-02", 5), "x", user, T)).toThrow(/motivo/)
    const voided = voidSession(session("2026-03-02", 5), "Lançada por engano", user, T)
    expect(voided.voidedAt).toBe(T)
    expect(() => voidSession(voided, "Outra vez", user, T)).toThrow(/já foi anulada/)
  })
})

describe("ABA — tipos auxiliares", () => {
  it("plano criado fica em rascunho e sem objetivos", () => {
    const p: AbaPlan = base()
    expect(p).toMatchObject({ status: "draft", goals: [] })
  })
})
