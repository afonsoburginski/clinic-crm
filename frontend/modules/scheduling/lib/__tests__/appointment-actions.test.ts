import { describe, expect, it, vi } from "vitest"

import { canUserTransition, TRANSITIONS } from "@/domain/appointment-status"
import type { Appointment, AppointmentStatus, User } from "@/domain/types"
import { itemFor, menuFor, userWith, visibleIds } from "@/shared/ui/entity-menu/testing"

import { appointmentActions, appointmentTimeText } from "../appointment-actions"

const appt = (status: AppointmentStatus, over: Partial<Appointment> = {}): Appointment => ({
  id: "ap-1",
  kind: "appointment",
  patientId: "p-1",
  professionalId: "pr-1",
  status,
  start: "2026-11-03T12:00:00.000Z",
  end: "2026-11-03T12:50:00.000Z",
  createdBy: "u",
  createdAt: "",
  updatedAt: "",
  ...over,
})
const handlers = (user: User | null, over: Record<string, unknown> = {}) => ({
  user,
  requireCancelReason: true,
  onChangeStatus: vi.fn(),
  onView: vi.fn(),
  onReschedule: vi.fn(),
  onOpenPatient: vi.fn(),
  ...over,
})
const reception = userWith(["reception"])
const helena = userWith(["professional"], { professionalId: "pr-1" })

/** As transições que o menu oferece dentro de "Alterar situação". */
function statusTargets(appointment: Appointment, user: User) {
  const status = menuFor(appointmentActions(appointment, handlers(user)), user).find((node) => node.type === "submenu")
  return status?.type === "submenu" ? status.items.map((item) => item.id.replace("status-", "")) : []
}

describe("AGD — ações do card da agenda", () => {
  it("as situações oferecidas são exatamente as da máquina de estados para o papel (recepção)", () => {
    for (const status of Object.keys(TRANSITIONS) as AppointmentStatus[]) {
      const expected = TRANSITIONS[status].filter((to) => to !== "cancelled" && canUserTransition(reception, appt(status), to))
      expect(statusTargets(appt(status), reception)).toEqual(expected)
    }
  })

  it("o profissional só muda a situação da própria agenda e só para iniciar, concluir ou registrar falta", () => {
    expect(statusTargets(appt("confirmed"), helena)).toEqual(["in_progress", "no_show"])
    expect(statusTargets(appt("confirmed", { professionalId: "pr-2" }), helena)).toEqual([])
    expect(statusTargets(appt("in_progress"), helena)).toEqual(["completed"])
  })

  it("agendamento confirmado: ver, reagendar, abrir ficha, copiar e cancelar (destrutivo, motivo conforme a clínica)", () => {
    const actions = appointmentActions(appt("confirmed"), handlers(reception))
    expect(visibleIds(actions, reception)).toEqual(["view", "reschedule", "patient", "status-in_progress", "status-no_show", "copy-time", "copy-id", "cancel"])
    const cancel = itemFor(actions, reception, "cancel")
    expect(cancel?.destructive).toBe(true)
    expect(cancel?.action.kind !== "copy" && cancel?.action.confirm?.reason?.required).toBe(true)
    const relaxed = itemFor(appointmentActions(appt("confirmed"), handlers(reception, { requireCancelReason: false })), reception, "cancel")
    expect(relaxed?.action.kind !== "copy" && relaxed?.action.confirm?.reason?.required).toBe(false)
  })

  it("atendimento encerrado (concluído, cancelado, falta) não reagenda nem muda de situação", () => {
    for (const status of ["completed", "cancelled", "no_show"] as const) {
      expect(visibleIds(appointmentActions(appt(status), handlers(reception)), reception)).toEqual(["view", "patient", "copy-time", "copy-id"])
    }
  })

  it("em atendimento não reagenda nem cancela; só conclui", () => {
    const ids = visibleIds(appointmentActions(appt("in_progress"), handlers(reception)), reception)
    expect(ids).not.toContain("reschedule")
    expect(ids).not.toContain("cancel")
    expect(ids).toContain("status-completed")
  })

  it("bloqueio de agenda: editar e remover; sem ficha de paciente nem mudança de situação", () => {
    const block = appt("confirmed", { kind: "block", title: "Reunião", patientId: undefined })
    const actions = appointmentActions(block, handlers(reception))
    expect(visibleIds(actions, reception)).toEqual(["view", "reschedule", "copy-time", "copy-id", "cancel"])
    expect(itemFor(actions, reception, "reschedule")?.label).toBe("Editar bloqueio")
    expect(itemFor(actions, reception, "cancel")?.label).toBe("Remover bloqueio")
  })

  it("sem os handlers de tela (ficha do paciente) 'Ver detalhes' e 'Reagendar' não aparecem", () => {
    const ids = visibleIds(appointmentActions(appt("confirmed"), handlers(reception, { onView: undefined, onReschedule: undefined })), reception)
    expect(ids).not.toContain("view")
    expect(ids).not.toContain("reschedule")
  })

  it("cancelar e mudar a situação chamam onChangeStatus (cancelar leva o motivo)", async () => {
    const h = handlers(reception)
    const actions = appointmentActions(appt("confirmed"), h)
    const start = itemFor(actions, reception, "status-in_progress")
    if (start?.action.kind !== "copy") await start?.action.onSelect()
    const cancel = itemFor(actions, reception, "cancel")
    if (cancel?.action.kind !== "copy") await cancel?.action.onSelect("Paciente avisou")
    expect(h.onChangeStatus.mock.calls).toEqual([["in_progress"], ["cancelled", "Paciente avisou"]])
  })

  it("copiar horário leva data e intervalo legíveis em pt-BR", () => {
    expect(appointmentTimeText(appt("confirmed"))).toMatch(/3 de novembro.*\d{2}:\d{2}–\d{2}:\d{2}/)
    const copy = itemFor(appointmentActions(appt("confirmed"), handlers(reception)), reception, "copy-time")?.action
    expect(copy?.kind === "copy" && copy.successMessage).toBe("Horário copiado.")
  })
})
