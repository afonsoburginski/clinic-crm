import { describe, expect, it, vi } from "vitest"

import type { Assessment, AssessmentStatus } from "@/domain/types"
import { itemFor, userWith, visibleIds } from "@/shared/ui/entity-menu/testing"

import { assessmentActions, completionBlocker } from "../assessment-actions"

const assessment = (status: AssessmentStatus, over: Partial<Assessment> = {}): Assessment => ({
  id: "a-1",
  patientId: "p-1",
  title: "Avaliação inicial",
  purpose: "",
  responsibleProfessionalId: "pr-1",
  status,
  stages: [{ id: "s1", status: "done" }] as Assessment["stages"],
  interpretations: [{ id: "i1" }] as Assessment["interpretations"],
  history: [],
  createdBy: "u",
  createdAt: "",
  updatedAt: "",
  ...over,
})
const handlers = (isResponsible = true) => ({ onView: vi.fn(), onComplete: vi.fn(), onCancel: vi.fn(), isResponsible })
const professional = userWith(["professional"], { professionalId: "pr-1" })

describe("AVA — ações da avaliação", () => {
  it("em andamento e pronta: concluir e cancelar (destrutivo, com motivo)", () => {
    const actions = assessmentActions(assessment("in_progress"), handlers())
    expect(visibleIds(actions, professional)).toEqual(["view", "copy-id", "complete", "cancel"])
    expect(itemFor(actions, professional, "complete")?.disabled).toBe(false)
    expect(itemFor(actions, professional, "cancel")).toMatchObject({ destructive: true })
  })

  it("concluir fica desabilitado com etapa pendente ou sem interpretação, dizendo o porquê", () => {
    const pending = assessment("in_progress", { stages: [{ id: "s1", status: "pending" }] as Assessment["stages"] })
    expect(completionBlocker(pending)).toBe("Conclua todas as etapas antes de concluir a avaliação.")
    expect(itemFor(assessmentActions(pending, handlers()), professional, "complete")).toMatchObject({ disabled: true })
    const noInterpretation = assessment("in_progress", { interpretations: [] })
    expect(completionBlocker(noInterpretation)).toBe("Registre ao menos uma interpretação antes de concluir a avaliação.")
    expect(completionBlocker(assessment("in_progress"))).toBeUndefined()
  })

  it("quem não é o responsável vê concluir/cancelar desabilitados", () => {
    const actions = assessmentActions(assessment("in_progress"), handlers(false))
    expect(itemFor(actions, professional, "complete")).toMatchObject({ disabled: true, disabledReason: "Só o profissional responsável pode fazer isso." })
    expect(itemFor(actions, professional, "cancel")).toMatchObject({ disabled: true })
  })

  it("avaliação concluída ou cancelada só vê e copia; sem clinical:write também", () => {
    expect(visibleIds(assessmentActions(assessment("completed"), handlers()), professional)).toEqual(["view", "copy-id"])
    expect(visibleIds(assessmentActions(assessment("cancelled"), handlers()), professional)).toEqual(["view", "copy-id"])
    expect(visibleIds(assessmentActions(assessment("in_progress"), handlers()), userWith(["admin"]))).toEqual(["view", "copy-id"])
  })

  it("cancelar leva o motivo digitado ao callback", async () => {
    const h = handlers()
    const cancel = itemFor(assessmentActions(assessment("in_progress"), h), professional, "cancel")
    if (cancel?.action.kind !== "copy") await cancel?.action.onSelect("Paciente desistiu")
    expect(h.onCancel).toHaveBeenCalledWith("Paciente desistiu")
  })
})
