import { describe, expect, it, vi } from "vitest"

import type { Professional, Room, Service } from "@/domain/types"
import { itemFor, userWith, visibleIds } from "@/shared/ui/entity-menu/testing"

import { professionalActions, professionalToInput } from "../professional-actions"
import { copyName, roomActions, roomToInput, serviceActions, serviceToInput } from "../service-actions"

const admin = userWith(["admin"])
const service: Service = { id: "s-1", name: "Terapia ABA", specialtyId: "sp-1", durationMin: 50, referencePriceCents: 15_000, requiresRoom: true, active: true }
const room: Room = { id: "r-1", name: "Sala 1", capacity: 3, exclusive: true, active: true }
const professional: Professional = {
  id: "pr-1",
  name: "Helena",
  email: "h@x.com",
  specialtyIds: ["sp-1"],
  active: true,
  colorIndex: 0,
  schedule: [],
  unavailabilities: [],
  createdAt: "",
}
const handlers = () => ({ onEdit: vi.fn(), onDuplicate: vi.fn(), onSetActive: vi.fn() })

describe("CAT — serviços e salas", () => {
  it("serviço ativo: editar, duplicar, copiar e inativar (destrutivo); inativo: reativar", () => {
    expect(visibleIds(serviceActions(service, handlers()), admin)).toEqual(["edit", "duplicate", "copy-id", "deactivate"])
    expect(itemFor(serviceActions(service, handlers()), admin, "deactivate")).toMatchObject({ destructive: true })
    expect(visibleIds(serviceActions({ ...service, active: false }, handlers()), admin)).toEqual(["edit", "duplicate", "copy-id", "reactivate"])
  })

  it("sala segue a mesma regra, com o texto no feminino, e exige rooms:manage", () => {
    const deactivate = itemFor(roomActions(room, handlers()), admin, "deactivate")
    expect(deactivate?.action.kind !== "copy" && deactivate?.action.confirm?.description).toContain("A sala deixa de ser oferecida")
    expect(visibleIds(roomActions(room, handlers()), userWith(["reception"]))).toEqual(["copy-id"])
    expect(visibleIds(serviceActions(service, handlers()), userWith(["manager"]))).toEqual(["copy-id"])
  })

  it("mudar a situação preserva o resto do cadastro; duplicar sugere o nome da cópia", () => {
    expect(serviceToInput(service, { active: false })).toEqual({ name: "Terapia ABA", specialtyId: "sp-1", durationMin: 50, referencePrice: 150, requiresRoom: true, active: false })
    expect(roomToInput(room, { active: false })).toEqual({ name: "Sala 1", capacity: 3, exclusive: true, active: false, notes: "" })
    expect(copyName("Sala 1")).toBe("Sala 1 (cópia)")
  })
})

describe("CAT — profissionais", () => {
  const h = () => ({ onView: vi.fn(), onEdit: vi.fn(), onSetActive: vi.fn() })

  it("gestor edita e inativa; recepção só vê e copia", () => {
    expect(visibleIds(professionalActions(professional, h()), userWith(["manager"]))).toEqual(["view", "edit", "copy-email", "copy-id", "deactivate"])
    expect(visibleIds(professionalActions(professional, h()), userWith(["reception"]))).toEqual(["view", "copy-email", "copy-id"])
  })

  it("profissional inativo oferece reativar; reativar/inativar levam o booleano certo", async () => {
    const handlers = h()
    const off = itemFor(professionalActions(professional, handlers), admin, "deactivate")
    if (off?.action.kind !== "copy") await off?.action.onSelect()
    const on = itemFor(professionalActions({ ...professional, active: false }, handlers), admin, "reactivate")
    if (on?.action.kind !== "copy") await on?.action.onSelect()
    expect(handlers.onSetActive.mock.calls).toEqual([[false], [true]])
  })

  it("o corpo da mudança preserva nome, contato e especialidades", () => {
    expect(professionalToInput(professional, { active: false })).toEqual({ name: "Helena", email: "h@x.com", phone: "", registry: "", specialtyIds: ["sp-1"], active: false })
  })
})
