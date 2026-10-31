import { describe, expect, it } from "vitest"

import {
  DEFAULT_SETTINGS,
  fromAuditResource,
  toAppointment,
  toAuditEntry,
  toGuardian,
  toGuardianLink,
  toPatient,
  toProfessional,
  toService,
  toSettings,
  toUser,
} from "../backend-mappers"

describe("backend-mappers", () => {
  it("usuário ganha o título do papel principal e ignora papéis desconhecidos", () => {
    const user = toUser({ id: "u1", name: "Helena", email: "h@c.com", roles: ["professional", "root"], professionalId: "pr1" })
    expect(user).toEqual({ id: "u1", name: "Helena", email: "h@c.com", title: "Profissional", roles: ["professional"], professionalId: "pr1" })
  })

  it("paciente: código bruto vira PAC-####, data civil e null vira ausência", () => {
    const patient = toPatient({
      id: "p1",
      code: "7",
      fullName: "Ana Souza",
      socialName: null,
      birthDate: "2019-05-10T00:00:00.000Z",
      document: "",
      phone: "(11) 91234-5678",
      status: "active",
      mainProfessionalId: null,
      consentData: true,
      consentImage: false,
      createdAt: "2026-01-01T10:00:00.000Z",
    })
    expect(patient).toMatchObject({
      code: "PAC-0007",
      birthDate: "2019-05-10",
      socialName: undefined,
      document: undefined,
      phone: "(11) 91234-5678",
      mainProfessionalId: undefined,
      consentData: true,
      consentImage: false,
      updatedAt: "2026-01-01T10:00:00.000Z",
    })
    expect(toPatient({ id: "p2", code: "PAC-0012" }).code).toBe("PAC-0012")
  })

  it("responsável e vínculo aceitam as colunas em snake_case", () => {
    expect(toGuardian({ id: "g1", full_name: "Maria", phone: "1199", email: null, created_at: "2026-01-01T00:00:00.000Z" })).toMatchObject({
      fullName: "Maria",
      email: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
    })
    expect(
      toGuardianLink({ id: "l1", patient_id: "p1", guardian_id: "g1", relationship: "Mãe", is_primary_contact: true, can_receive_documents: true, restrictions: null })
    ).toEqual({
      id: "l1",
      patientId: "p1",
      guardianId: "g1",
      relationship: "Mãe",
      isLegalGuardian: false,
      canSchedule: false,
      canReceiveDocuments: true,
      isPrimaryContact: true,
      restrictions: undefined,
    })
  })

  it("catálogo: payload parcial recebe padrões coerentes", () => {
    expect(toService({ id: "s1", name: "Sessão", specialtyId: "e1", durationMin: 50, referencePriceCents: 15000 })).toMatchObject({
      active: true,
      requiresRoom: false,
      referencePriceCents: 15000,
    })
    const professional = toProfessional({
      id: "pr1",
      name: "Rafael",
      email: "r@c.com",
      phone: "",
      specialtyIds: ["e1", 7],
      schedule: [{ weekday: 1, start: "08:00", end: "12:00" }, "lixo"],
      unavailabilities: [{ id: "un1", start: "2030-01-01T10:00:00.000Z", end: "2030-01-01T11:00:00.000Z", reason: "Curso" }],
    })
    expect(professional).toMatchObject({
      phone: undefined,
      specialtyIds: ["e1"],
      active: true,
      colorIndex: 0,
      schedule: [{ weekday: 1, start: "08:00", end: "12:00" }],
      unavailabilities: [{ id: "un1", reason: "Curso" }],
    })
  })

  it("agendamento: lê o formato da listagem, do SELECT * e completa com a base", () => {
    const listed = toAppointment({
      id: "a1",
      kind: "appointment",
      title: null,
      patientId: "p1",
      professionalId: "pr1",
      serviceId: "s1",
      roomId: null,
      start: "2030-01-07T12:00:00.000Z",
      end: "2030-01-07T13:00:00.000Z",
      status: "confirmed",
      notes: null,
      createdBy: "u1",
    })
    expect(listed).toMatchObject({ roomId: undefined, notes: undefined, title: undefined, createdBy: "u1", createdAt: "" })

    const raw = toAppointment({ id: "a2", professional_id: "pr1", starts_at: "2030-01-07T12:00:00.000Z", ends_at: "2030-01-07T13:00:00.000Z", status: "pending", created_at: "2026-01-01T00:00:00.000Z", cancel_reason: "Viagem" })
    expect(raw).toMatchObject({ professionalId: "pr1", start: "2030-01-07T12:00:00.000Z", cancelReason: "Viagem", createdAt: "2026-01-01T00:00:00.000Z" })

    expect(toAppointment({ id: "a3", status: "confirmed" }, { patientId: "p9", professionalId: "pr9", start: "s", end: "e" })).toMatchObject({ patientId: "p9", professionalId: "pr9", start: "s", end: "e" })
  })

  it("configurações: `{}` da API vira o padrão; valores salvos prevalecem", () => {
    expect(toSettings({})).toEqual(DEFAULT_SETTINGS)
    const saved = toSettings({ name: "Clínica Sol", minLeadMinutes: 0, requireCancelReason: false, businessHours: [{ weekday: 1, open: "09:00", close: "17:00", closed: false }] })
    expect(saved).toMatchObject({ name: "Clínica Sol", minLeadMinutes: 0, requireCancelReason: false, lateToleranceMinutes: 15 })
    expect(saved.businessHours).toEqual([{ weekday: 1, open: "09:00", close: "17:00", closed: false }])
  })

  it("auditoria: id sintético, ator pelo nome conhecido e campos alterados sem valores", () => {
    const entry = toAuditEntry(
      { actorId: "u1", at: "2026-01-02T10:00:00.000Z", action: "update", resource: "clinical-record", resourceId: "r1", summary: "Alterou registro clínico", changes: [{ field: "title", from: null, to: null }] },
      3,
      (id) => (id === "u1" ? "Marina" : id)
    )
    expect(entry).toMatchObject({
      id: "2026-01-02T10:00:00.000Z|clinical_record|r1|3",
      actorName: "Marina",
      resource: "clinical_record",
      changes: { title: { from: null, to: null } },
    })
    expect(toAuditEntry({ actorId: "u2", at: "", action: "create", resource: "room", resourceId: "x", summary: "s", changes: null }, 0, (id) => id)).toMatchObject({ actorName: "u2", changes: undefined })
    expect(fromAuditResource("clinical_record")).toBe("clinical-record")
  })
})
