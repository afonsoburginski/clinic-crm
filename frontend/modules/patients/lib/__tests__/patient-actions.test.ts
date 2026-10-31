import { describe, expect, it, vi } from "vitest"

import type { Guardian, Patient, PatientStatus } from "@/domain/types"
import { itemFor, userWith, visibleIds } from "@/shared/ui/entity-menu/testing"

import { guardianActions, guardianLinkActions } from "../guardian-actions"
import { patientActions } from "../patient-actions"
import { patientToInput } from "../patient-input"

const patient = (status: PatientStatus): Patient => ({
  id: "p-1",
  code: "PAC-0007",
  fullName: "Maria Souza",
  socialName: "Mari",
  birthDate: "2015-03-01",
  phone: "11999990000",
  status,
  consentData: true,
  consentImage: false,
  createdAt: "",
  updatedAt: "",
})
const handlers = () => ({ onView: vi.fn(), onEdit: vi.fn(), onSchedule: vi.fn(), onSetStatus: vi.fn() })
const reception = userWith(["reception"])

describe("PAC — ações do paciente", () => {
  it("paciente ativo: ver, editar, agendar, copiar e inativar (destrutivo, com texto do nome social)", () => {
    const actions = patientActions(patient("active"), handlers())
    expect(visibleIds(actions, reception)).toEqual(["view", "edit", "schedule", "copy-code", "copy-id", "deactivate"])
    const deactivate = itemFor(actions, reception, "deactivate")
    expect(deactivate?.destructive).toBe(true)
    expect(deactivate?.action.kind !== "copy" && deactivate?.action.confirm?.title).toBe("Inativar Mari?")
  })

  it("paciente inativo não agenda e oferece reativar (sem confirmação)", () => {
    const actions = patientActions(patient("inactive"), handlers())
    expect(visibleIds(actions, reception)).toEqual(["view", "edit", "copy-code", "copy-id", "reactivate"])
    expect(itemFor(actions, reception, "reactivate")?.destructive).toBe(false)
  })

  it("quem só lê (profissional, gestor) não vê editar, agendar nem mudar a situação", () => {
    const professional = userWith(["professional"], { professionalId: "pr-1" })
    expect(visibleIds(patientActions(patient("active"), handlers()), professional)).toEqual(["view", "copy-code", "copy-id"])
    expect(visibleIds(patientActions(patient("active"), handlers()), userWith(["finance"]))).toEqual(["view", "copy-code", "copy-id"])
  })

  it("inativar e reativar chamam onSetStatus com a situação certa; na ficha o 'Ver' some", async () => {
    const h = handlers()
    const inactive = itemFor(patientActions(patient("active"), h), reception, "deactivate")
    if (inactive?.action.kind !== "copy") await inactive?.action.onSelect()
    const active = itemFor(patientActions(patient("archived"), h), reception, "reactivate")
    if (active?.action.kind !== "copy") await active?.action.onSelect()
    expect(h.onSetStatus.mock.calls).toEqual([["inactive"], ["active"]])
    expect(visibleIds(patientActions(patient("active"), { ...h, inDetail: true }), reception)).not.toContain("view")
  })

  it("o corpo da mudança de situação preserva todos os campos do cadastro", () => {
    const input = patientToInput(patient("active"))
    expect(input).toMatchObject({ fullName: "Maria Souza", socialName: "Mari", birthDate: "2015-03-01", phone: "11999990000", consentData: true, status: "active" })
    expect(patientToInput()).toMatchObject({ fullName: "", status: "active", consentData: false })
  })
})

describe("PAC — responsáveis", () => {
  const guardian: Guardian = { id: "g-1", fullName: "Ana Souza", phone: "11988887777", createdAt: "" }

  it("editar exige guardians:write; copiar telefone e ID sempre; e-mail só se existir", () => {
    const actions = guardianActions(guardian, { onEdit: vi.fn() })
    expect(visibleIds(actions, reception)).toEqual(["edit", "copy-phone", "copy-id"])
    expect(visibleIds(actions, userWith(["finance"]))).toEqual(["copy-phone", "copy-id"])
    expect(visibleIds(guardianActions({ ...guardian, email: "ana@x.com" }, { onEdit: vi.fn() }), reception)).toContain("copy-email")
  })

  it("remover vínculo é destrutivo e a confirmação cita o responsável e o paciente", () => {
    const actions = guardianLinkActions({ id: "l-1", guardianName: "Ana Souza", patientName: "Maria Souza" }, { onEdit: vi.fn(), onRemove: vi.fn() })
    const remove = itemFor(actions, reception, "remove")
    expect(remove?.destructive).toBe(true)
    expect(remove?.action.kind !== "copy" && remove?.action.confirm?.description).toContain("Ana Souza deixará de ser responsável por Maria Souza")
    expect(visibleIds(actions, userWith(["professional"], { professionalId: "p" }))).toEqual(["copy-id"])
  })
})
