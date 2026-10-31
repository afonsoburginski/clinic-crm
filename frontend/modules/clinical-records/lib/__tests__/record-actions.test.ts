import { describe, expect, it, vi } from "vitest"

import type { ClinicalRecord, ClinicalRecordStatus } from "@/domain/types"
import { itemFor, userWith, visibleIds } from "@/shared/ui/entity-menu/testing"

import { chartActions, recordActions } from "../record-actions"

const record = (status: ClinicalRecordStatus, content = "Paciente relata melhora significativa nas últimas semanas."): ClinicalRecord => ({
  id: "r-1",
  patientId: "p-1",
  kind: "evolution",
  title: "Evolução",
  content,
  status,
  version: 1,
  rootId: "r-1",
  authorId: "u-1",
  authorName: "Helena",
  professionalId: "pr-1",
  createdAt: "",
  updatedAt: "",
  history: [],
})
const handlers = (isAuthor = true) => ({ onView: vi.fn(), onEdit: vi.fn(), onFinalize: vi.fn(), onRectify: vi.fn(), isAuthor })
const professional = userWith(["professional"], { professionalId: "pr-1" })

describe("PRN — ações do registro", () => {
  it("rascunho do autor: editar e finalizar (com confirmação, sem ser destrutivo)", () => {
    const actions = recordActions(record("draft"), handlers())
    expect(visibleIds(actions, professional)).toEqual(["view", "edit", "copy-id", "finalize"])
    expect(itemFor(actions, professional, "finalize")).toMatchObject({ disabled: false, destructive: false })
  })

  it("finalizar fica desabilitado com conteúdo curto (mínimo de 20 caracteres)", () => {
    const item = itemFor(recordActions(record("draft", "curto"), handlers()), professional, "finalize")
    expect(item).toMatchObject({ disabled: true })
    expect(item?.disabledReason).toContain("20 caracteres")
  })

  it("registro finalizado oferece retificar (motivo obrigatório); nunca há ação de exclusão", () => {
    const actions = recordActions(record("finalized"), handlers())
    expect(visibleIds(actions, professional)).toEqual(["view", "copy-id", "rectify"])
    const rectify = itemFor(actions, professional, "rectify")
    expect(rectify?.action.kind !== "copy" && rectify?.action.confirm?.reason?.required).toBe(true)
    for (const status of ["draft", "finalized", "rectified"] as const) {
      expect(visibleIds(recordActions(record(status), handlers()), professional).some((id) => /delete|remove|excluir/.test(id))).toBe(false)
    }
  })

  it("versão retificada só vê e copia", () => {
    expect(visibleIds(recordActions(record("rectified"), handlers()), professional)).toEqual(["view", "copy-id"])
  })

  it("quem não é o autor vê as ações de escrita desabilitadas; sem clinical:write elas somem", () => {
    const notAuthor = recordActions(record("draft"), handlers(false))
    expect(itemFor(notAuthor, professional, "edit")).toMatchObject({ disabled: true, disabledReason: "Só o autor do registro pode fazer isso." })
    expect(itemFor(notAuthor, professional, "finalize")?.disabled).toBe(true)
    expect(visibleIds(recordActions(record("draft"), handlers()), userWith(["admin"]))).toEqual(["view", "copy-id"])
  })

  it("retificar leva o motivo digitado", async () => {
    const h = handlers()
    const rectify = itemFor(recordActions(record("finalized"), h), professional, "rectify")
    if (rectify?.action.kind !== "copy") await rectify?.action.onSelect("Data do atendimento incorreta")
    expect(h.onRectify).toHaveBeenCalledWith("Data do atendimento incorreta")
  })

  it("lista de prontuários: abrir e copiar código e ID", () => {
    expect(visibleIds(chartActions({ id: "p-1", code: "PAC-0001" }, { onOpen: vi.fn() }), professional)).toEqual(["open", "copy-code", "copy-id"])
  })
})
