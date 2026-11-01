import { describe, expect, it } from "vitest"

import {
  addInterpretation,
  assertResponsibleOperable,
  canInterpret,
  canTransitionStage,
  cancelAssessment,
  completeAssessment,
  createAssessment,
  setStageStatus,
} from "../assessment"
import { ForbiddenError, ValidationError } from "../errors"
import { permissionsFor } from "../permissions"
import type { Assessment, Role, User } from "../types"

const user = (roles: Role[], id: string, professionalId?: string): User => ({
  id,
  name: id,
  email: `${id}@t.com`,
  title: "",
  roles,
  professionalId,
})

const responsible = user(["professional"], "u-resp", "p1")
const colleague = user(["professional"], "u-col", "p2")
const reception = user(["reception"], "u-rec")
const T = "2026-02-01T10:00:00.000Z"
const TEXT = "Perfil compatível com dificuldades de atenção sustentada, a confirmar na devolutiva."

let n = 0
const newId = () => `s${++n}`

const open = (stages = ["Anamnese", "Testes", "Devolutiva"]): Assessment =>
  createAssessment(
    { id: "a1", patientId: "pa-1", title: "Avaliação neuropsicológica", purpose: "Investigação de atenção", responsibleProfessionalId: "p1", stages },
    newId,
    responsible,
    T
  )

const allDone = (a: Assessment) =>
  a.stages.reduce((acc, s) => setStageStatus(setStageStatus(acc, s.id, "in_progress", responsible, T), s.id, "done", responsible, T), a)

describe("AVA — abertura (RN-AVA-001/007)", () => {
  it("cria com etapas pendentes e histórico inicial", () => {
    const a = open()
    expect(a.status).toBe("in_progress")
    expect(a.stages.map((s) => s.status)).toEqual(["pending", "pending", "pending"])
    expect(a.history).toHaveLength(1)
    expect(a.responsibleProfessionalId).toBe("p1")
  })

  it("recusa lista vazia e nomes repetidos", () => {
    expect(() => open([])).toThrow(ValidationError)
    expect(() => open(["Testes", " testes "])).toThrow(/repetir/)
  })
})

describe("AVA — responsável que pode operar (RN-AVA-001)", () => {
  const ok = { active: true, hasClinicalAccount: true, linkedToPatient: true }

  it("aceita responsável ativo, com conta clínica e vínculo com o paciente", () => {
    expect(() => assertResponsibleOperable(ok)).not.toThrow()
  })

  it.each([
    ["inativo", { active: false }],
    ["sem conta de perfil clínico", { hasClinicalAccount: false }],
    ["sem vínculo com o paciente", { linkedToPatient: false }],
  ])("recusa responsável %s", (_, over) => {
    expect(() => assertResponsibleOperable({ ...ok, ...over })).toThrow(/responsável ativo e vinculado/)
  })
})

describe("AVA — etapas (RN-AVA-002)", () => {
  it("segue as transições permitidas", () => {
    expect(canTransitionStage("pending", "in_progress")).toBe(true)
    expect(canTransitionStage("in_progress", "pending")).toBe(true)
    expect(canTransitionStage("in_progress", "done")).toBe(true)
    expect(canTransitionStage("pending", "done")).toBe(false)
  })

  it("etapa concluída não volta (CA-AVA-002)", () => {
    const a = open(["Testes"])
    const done = allDone(a)
    expect(() => setStageStatus(done, done.stages[0].id, "pending", responsible, T)).toThrow(ValidationError)
  })

  it("registra cada mudança no histórico", () => {
    const a = open(["Testes"])
    const next = setStageStatus(a, a.stages[0].id, "in_progress", responsible, T)
    expect(next.history).toHaveLength(2)
    expect(next.history[1].summary).toContain("Testes")
  })
})

describe("AVA — interpretação só por perfil clínico (RN-AVA-003)", () => {
  it("apenas o profissional e o administrador (acesso total) têm assessments:interpret", () => {
    expect(canInterpret(responsible)).toBe(true)
    expect(permissionsFor(["admin"]).has("assessments:interpret")).toBe(true)
    for (const role of ["reception", "finance", "manager"] as Role[]) {
      expect(permissionsFor([role]).has("assessments:interpret")).toBe(false)
    }
  })

  it("perfil não clínico é recusado (CA-AVA-001)", () => {
    expect(() => addInterpretation(open(), TEXT, "i1", reception, T)).toThrow(ForbiddenError)
  })

  it("exige texto mínimo e acrescenta versões sem apagar as anteriores", () => {
    expect(() => addInterpretation(open(), "curto", "i1", responsible, T)).toThrow(ValidationError)
    const v1 = addInterpretation(open(), TEXT, "i1", responsible, T)
    const v2 = addInterpretation(v1, `${TEXT} Revisada.`, "i2", colleague, T)
    expect(v2.interpretations.map((i) => [i.version, i.authorId])).toEqual([
      [1, "u-resp"],
      [2, "u-col"],
    ])
    expect(v2.interpretations[0].text).toBe(TEXT)
  })
})

describe("AVA — conclusão e cancelamento (RN-AVA-004/005/006)", () => {
  it("não conclui com etapa pendente (CA-AVA-003)", () => {
    const a = addInterpretation(open(["Testes"]), TEXT, "i1", responsible, T)
    expect(() => completeAssessment(a, responsible, T)).toThrow(/etapas/)
  })

  it("não conclui sem interpretação", () => {
    expect(() => completeAssessment(allDone(open(["Testes"])), responsible, T)).toThrow(/interpretação/)
  })

  it("só o responsável conclui ou cancela (CA-AVA-004)", () => {
    const ready = addInterpretation(allDone(open(["Testes"])), TEXT, "i1", responsible, T)
    expect(() => completeAssessment(ready, colleague, T)).toThrow(ForbiddenError)
    expect(() => cancelAssessment(open(), "Paciente desistiu", colleague, T)).toThrow(ForbiddenError)
  })

  it("conclui e fica somente leitura", () => {
    const ready = addInterpretation(allDone(open(["Testes"])), TEXT, "i1", responsible, T)
    const done = completeAssessment(ready, responsible, T)
    expect(done.status).toBe("completed")
    expect(done.completedAt).toBe(T)
    expect(() => addInterpretation(done, `${TEXT} Extra`, "i2", responsible, T)).toThrow(ValidationError)
    expect(() => cancelAssessment(done, "Tentativa tardia", responsible, T)).toThrow(ValidationError)
  })

  it("cancelar exige motivo e preserva o histórico", () => {
    expect(() => cancelAssessment(open(), "x", responsible, T)).toThrow(/motivo/)
    const cancelled = cancelAssessment(open(), "Família mudou de cidade", responsible, T)
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Família mudou de cidade" })
    expect(cancelled.history.at(-1)?.summary).toBe("Avaliação cancelada")
  })
})
