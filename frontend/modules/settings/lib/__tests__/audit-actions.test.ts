import { describe, expect, it, vi } from "vitest"

import type { AuditEntry } from "@/domain/types"
import { itemFor, userWith, visibleIds } from "@/shared/ui/entity-menu/testing"

import { auditActions } from "../audit-actions"

const entry = (changes?: AuditEntry["changes"]): AuditEntry => ({
  id: "ev-1",
  at: "2026-10-30T12:00:00Z",
  actorId: "u-1",
  actorName: "Ana",
  action: "update",
  resource: "patient",
  resourceId: "p-1",
  summary: "Alterou o cadastro do paciente",
  changes,
})
const admin = userWith(["admin"])

describe("AUD — ações do evento de auditoria (imutável)", () => {
  it("só copia identificadores e a descrição quando não há campos alterados", () => {
    expect(visibleIds(auditActions(entry(), { onToggleDetails: vi.fn(), detailsOpen: false }), admin)).toEqual(["copy-id", "copy-resource-id", "copy-summary"])
  })

  it("com campos alterados oferece ver/recolher detalhes conforme o estado", () => {
    const changes = { phone: { from: "a", to: "b" } }
    expect(itemFor(auditActions(entry(changes), { onToggleDetails: vi.fn(), detailsOpen: false }), admin, "details")?.label).toBe("Ver detalhes")
    expect(itemFor(auditActions(entry(changes), { onToggleDetails: vi.fn(), detailsOpen: true }), admin, "details")?.label).toBe("Recolher detalhes")
  })

  it("nunca oferece editar nem excluir", () => {
    const ids = visibleIds(auditActions(entry({ x: { from: 1, to: 2 } }), { onToggleDetails: vi.fn(), detailsOpen: false }), admin)
    expect(ids.some((id) => /edit|delete|remove/.test(id))).toBe(false)
  })
})
