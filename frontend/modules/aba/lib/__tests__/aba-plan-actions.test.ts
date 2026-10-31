import { describe, expect, it, vi } from "vitest"

import type { AbaGoal, AbaPlan, AbaPlanStatus } from "@/domain/types"
import { itemFor, userWith, visibleIds } from "@/shared/ui/entity-menu/testing"

import { abaPlanActions } from "../aba-plan-actions"

const goal = (status: AbaGoal["status"]) => ({ id: "g", status }) as AbaGoal
const plan = (status: AbaPlanStatus, goals: AbaGoal[] = [goal("active")]): AbaPlan => ({
  id: "pl-1",
  patientId: "p-1",
  title: "Plano 1",
  startDate: "2026-10-01",
  responsibleProfessionalId: "pr-1",
  status,
  goals,
  changeLog: [],
  createdBy: "u",
  createdAt: "",
  updatedAt: "",
})
const handlers = () => ({ onView: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onActivate: vi.fn(), onClose: vi.fn() })
const professional = userWith(["professional"], { professionalId: "pr-1" })

describe("ABA — ações do plano", () => {
  it("rascunho: editar, duplicar e ativar; não encerra", () => {
    expect(visibleIds(abaPlanActions(plan("draft"), handlers()), professional)).toEqual(["view", "edit", "duplicate", "copy-id", "activate"])
  })

  it("ativar fica desabilitado sem objetivo ativo, com o motivo", () => {
    expect(itemFor(abaPlanActions(plan("draft", []), handlers()), professional, "activate")).toMatchObject({
      disabled: true,
      disabledReason: "Inclua ao menos um objetivo antes de ativar o plano.",
    })
    expect(itemFor(abaPlanActions(plan("draft", [goal("achieved")]), handlers()), professional, "activate")?.disabled).toBe(true)
  })

  it("plano ativo: encerrar (destrutivo, motivo obrigatório); plano encerrado: só ver, duplicar e copiar", () => {
    const active = abaPlanActions(plan("active"), handlers())
    expect(visibleIds(active, professional)).toEqual(["view", "edit", "duplicate", "copy-id", "close"])
    const close = itemFor(active, professional, "close")
    expect(close?.destructive).toBe(true)
    expect(close?.action.kind !== "copy" && close?.action.confirm?.reason).toEqual({ label: "Motivo do encerramento", required: true })
    expect(visibleIds(abaPlanActions(plan("closed"), handlers()), professional)).toEqual(["view", "duplicate", "copy-id"])
  })

  it("quem não tem clinical:write (administrador, financeiro) só vê e copia", () => {
    expect(visibleIds(abaPlanActions(plan("active"), handlers()), userWith(["admin"]))).toEqual(["view", "copy-id"])
  })

  it("encerrar leva o motivo digitado; na própria página o 'Ver' some", async () => {
    const h = handlers()
    const close = itemFor(abaPlanActions(plan("active"), h), professional, "close")
    if (close?.action.kind !== "copy") await close?.action.onSelect("Objetivos alcançados")
    expect(h.onClose).toHaveBeenCalledWith("Objetivos alcançados")
    expect(visibleIds(abaPlanActions(plan("active"), { ...h, inDetail: true }), professional)).not.toContain("view")
  })
})
