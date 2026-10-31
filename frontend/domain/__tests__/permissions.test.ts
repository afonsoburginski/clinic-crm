import { describe, expect, it } from "vitest"

import { can, canReadAppointment, CLINICAL_LINK_STATUSES, clinicalPatientIds, isScopedToOwnAgenda, permissionsFor } from "../permissions"
import type { Appointment, AppointmentStatus, User } from "../types"

const user = (roles: User["roles"], professionalId?: string): User => ({
  id: "u",
  name: "Teste",
  email: "t@t.com",
  title: "",
  roles,
  professionalId,
})

describe("AUTH — permissões", () => {
  it("RN-AUTH-001 · une as permissões de múltiplos papéis (CA-AUTH-001)", () => {
    const perms = permissionsFor(["professional", "manager"])
    expect(perms.has("professionals:manage")).toBe(true)
    expect(perms.has("appointments:read-own")).toBe(true)
    expect(perms.has("appointments:read")).toBe(true)
  })

  it("RN-AUTH-002 · administrador não tem acesso clínico", () => {
    expect(can(user(["admin"]), "clinical:read")).toBe(false)
    expect(can(user(["professional"], "p1"), "clinical:read")).toBe(true)
  })

  it("RN-AUTH-003 · profissional só lê os próprios agendamentos (CA-AUTH-002)", () => {
    const helena = user(["professional"], "p1")
    expect(canReadAppointment(helena, { professionalId: "p1" })).toBe(true)
    expect(canReadAppointment(helena, { professionalId: "p2" })).toBe(false)
    expect(isScopedToOwnAgenda(helena)).toBe(true)
  })

  it("recepção lê qualquer agenda e não fica restrita", () => {
    const rec = user(["reception"])
    expect(canReadAppointment(rec, { professionalId: "p2" })).toBe(true)
    expect(isScopedToOwnAgenda(rec)).toBe(false)
  })

  it("sem usuário, nada é permitido", () => {
    expect(can(null, "dashboard:read")).toBe(false)
  })
})

describe("PRN — vínculo clínico (RN-PRN-001)", () => {
  const prof = { id: "p1", active: true }
  const appt = (status: AppointmentStatus, over: Partial<Pick<Appointment, "kind" | "patientId" | "professionalId">> = {}) => ({
    kind: "appointment" as const,
    patientId: "pa-1",
    professionalId: "p1",
    status,
    ...over,
  })
  const ids = (professional: typeof prof | undefined, appointments: ReturnType<typeof appt>[], patients: { id: string; mainProfessionalId?: string }[] = []) =>
    [...clinicalPatientIds(professional, appointments, patients)].sort()

  it("só confirmado, em atendimento e concluído concedem vínculo", () => {
    expect([...CLINICAL_LINK_STATUSES].sort()).toEqual(["completed", "confirmed", "in_progress"])
    for (const status of CLINICAL_LINK_STATUSES) expect(ids(prof, [appt(status)])).toEqual(["pa-1"])
    for (const status of ["requested", "pending", "cancelled", "no_show"] as const) expect(ids(prof, [appt(status)])).toEqual([])
  })

  it("considera só os atendimentos do próprio profissional e ignora bloqueios", () => {
    expect(ids(prof, [appt("confirmed", { professionalId: "p2" })])).toEqual([])
    expect(ids(prof, [appt("confirmed", { kind: "block", patientId: undefined })])).toEqual([])
    expect(ids(prof, [appt("confirmed", { kind: "block" })])).toEqual([])
  })

  it("o profissional de referência vincula, com ou sem atendimento", () => {
    const patients = [
      { id: "pa-1", mainProfessionalId: "p1" },
      { id: "pa-2", mainProfessionalId: "p2" },
      { id: "pa-3" },
    ]
    expect(ids(prof, [appt("pending", { patientId: "pa-2" })], patients)).toEqual(["pa-1"])
    expect(ids(prof, [appt("completed", { patientId: "pa-2" })], patients)).toEqual(["pa-1", "pa-2"])
  })

  it("profissional inativo ou inexistente não alcança ninguém", () => {
    const patients = [{ id: "pa-1", mainProfessionalId: "p1" }]
    expect(ids({ ...prof, active: false }, [appt("completed")], patients)).toEqual([])
    expect(ids(undefined, [appt("completed")], patients)).toEqual([])
  })
})

describe("AUTH — matriz papel × permissão (a API aplica; a UI só espelha)", () => {
  const roles = ["admin", "reception", "professional", "finance", "manager"] as const
  const holders = (permission: Parameters<typeof can>[1]) => roles.filter((role) => can(user([role], "p1"), permission))

  it("só o financeiro escreve no financeiro; a administração apenas lê (CA-FIN-004)", () => {
    expect(holders("finance:write")).toEqual(["finance"])
    expect(holders("finance:read")).toEqual(["admin", "finance"])
  })

  it("recepção, financeiro, gestor e administração não leem nem escrevem prontuário (CA-PRN-001)", () => {
    expect(holders("clinical:read")).toEqual(["professional"])
    expect(holders("clinical:write")).toEqual(["professional"])
    expect(holders("assessments:interpret")).toEqual(["professional"])
  })

  it("financeiro não gerencia configurações nem catálogo (CA-AUTH-003)", () => {
    for (const permission of ["settings:manage", "professionals:manage", "services:manage", "rooms:manage"] as const) {
      expect(can(user(["finance"]), permission)).toBe(false)
    }
    expect(holders("settings:manage")).toEqual(["admin"])
    expect(holders("audit:read")).toEqual(["admin", "manager"])
  })

  it("profissional enxerga só os próprios pacientes e a própria agenda", () => {
    expect(holders("patients:read")).toEqual(["admin", "reception", "finance"])
    expect(holders("patients:read-own")).toEqual(["professional"])
    expect(holders("patients:write")).toEqual(["admin", "reception"])
    expect(holders("appointments:read-own")).toEqual(["professional"])
  })

  it("todo papel acessa o painel; documentos só para quem lida com pacientes ou finanças", () => {
    expect(holders("dashboard:read")).toEqual([...roles])
    expect(holders("documents:read")).toEqual(["admin", "reception", "professional", "finance"])
  })
})
