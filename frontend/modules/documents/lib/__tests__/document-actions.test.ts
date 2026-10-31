import { describe, expect, it, vi } from "vitest"

import type { DocumentStatus, PatientDocument } from "@/domain/types"
import { itemFor, userWith, visibleIds } from "@/shared/ui/entity-menu/testing"

import { documentActions } from "../document-actions"

const doc = (status: DocumentStatus): PatientDocument => ({
  id: "d-1",
  patientId: "p-1",
  title: "Declaração",
  type: "Declaração",
  classification: "administrative",
  status,
  releases: [],
  createdBy: "u",
  createdByName: "Ana",
  createdAt: "",
  updatedAt: "",
})
const handlers = () => ({ onView: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onIssue: vi.fn(), onArchive: vi.fn() })
const user = userWith(["reception"])

describe("DOC — ações do documento", () => {
  it("rascunho com escrita: editar, duplicar, emitir e arquivar (como o domínio permite); sem liberações", () => {
    expect(visibleIds(documentActions(doc("draft"), true, handlers()), user)).toEqual(["view", "edit", "duplicate", "copy-id", "issue", "archive"])
  })

  it("documento emitido: gerenciar liberações e arquivar (destrutivo); não edita nem emite de novo", () => {
    const actions = documentActions(doc("issued"), true, handlers())
    expect(visibleIds(actions, user)).toEqual(["view", "copy-id", "release", "archive"])
    expect(itemFor(actions, user, "archive")).toMatchObject({ destructive: true })
  })

  it("documento arquivado não oferece emitir, editar, liberar nem arquivar", () => {
    expect(visibleIds(documentActions(doc("archived"), true, handlers()), user)).toEqual(["view", "copy-id"])
  })

  it("sem escrita na classificação (canWrite=false) só vê e copia", () => {
    expect(visibleIds(documentActions(doc("draft"), false, handlers()), user)).toEqual(["view", "copy-id"])
    expect(visibleIds(documentActions(doc("issued"), false, handlers()), user)).toEqual(["view", "copy-id"])
  })

  it("emitir pede confirmação sem ser destrutivo; liberar abre o detalhe", async () => {
    const h = handlers()
    const actions = documentActions(doc("draft"), true, h)
    const issue = itemFor(actions, user, "issue")
    expect(issue?.destructive).toBe(false)
    expect(issue?.action.kind !== "copy" && issue?.action.confirm?.title).toBe("Emitir documento?")
    if (issue?.action.kind !== "copy") await issue?.action.onSelect()
    expect(h.onIssue).toHaveBeenCalledTimes(1)

    const issued = documentActions(doc("issued"), true, h)
    const release = itemFor(issued, user, "release")
    if (release?.action.kind !== "copy") await release?.action.onSelect()
    expect(h.onView).toHaveBeenCalledTimes(1)
  })
})
