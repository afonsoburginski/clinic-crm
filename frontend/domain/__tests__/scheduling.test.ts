import { describe, expect, it } from "vitest"

import { clinicDateTimeToISO } from "../clinic-time"
import { findConflicts, suggestNextSlot, type ConflictContext } from "../scheduling"
import type { Appointment, ClinicSettings, Professional, Room } from "../types"

// Segunda-feira, 2 de novembro de 2026 (horário da clínica)
const DAY = "2026-11-02"
const at = (time: string, day = DAY) => clinicDateTimeToISO(day, time)
const NOW = new Date(at("07:00"))

const settings: ClinicSettings = {
  name: "Clínica",
  legalName: "Clínica LTDA",
  document: "00.000.000/0001-00",
  phone: "",
  email: "c@c.com",
  address: "Rua",
  businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    open: "08:00",
    close: "20:00",
    closed: weekday === 0,
  })),
  minLeadMinutes: 60,
  lateToleranceMinutes: 15,
  rescheduleWindowHours: 24,
  requireCancelReason: true,
}

const professional: Professional = {
  id: "p1",
  name: "Helena",
  email: "h@h.com",
  specialtyIds: ["sp"],
  active: true,
  colorIndex: 0,
  schedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "08:00", end: "18:00" })),
  unavailabilities: [],
  createdAt: NOW.toISOString(),
}

const room: Room = { id: "r1", name: "Sala Jardim", capacity: 2, exclusive: true, active: true }

const appt = (overrides: Partial<Appointment>): Appointment => ({
  id: "a1",
  kind: "appointment",
  professionalId: "p1",
  start: at("10:00"),
  end: at("11:00"),
  status: "confirmed",
  createdBy: "u",
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...overrides,
})

const ctx = (overrides: Partial<ConflictContext> = {}): ConflictContext => ({
  appointments: [],
  professional,
  settings,
  now: NOW,
  ...overrides,
})

const types = (c: { type: string }[]) => c.map((x) => x.type)

describe("AGD — detecção de conflitos", () => {
  it("horário livre dentro da grade não tem conflito", () => {
    expect(findConflicts({ professionalId: "p1", start: at("09:00"), end: at("10:00") }, ctx())).toEqual([])
  })

  it("CA-AGD-001 · RN-AGD-003 · profissional ocupado", () => {
    const result = findConflicts(
      { professionalId: "p1", start: at("10:30"), end: at("11:30") },
      ctx({ appointments: [appt({})] })
    )
    expect(types(result)).toContain("professional_busy")
  })

  it("intervalos encostados não conflitam", () => {
    const result = findConflicts(
      { professionalId: "p1", start: at("11:00"), end: at("12:00") },
      ctx({ appointments: [appt({})] })
    )
    expect(result).toEqual([])
  })

  it("CA-AGD-002 · RN-AGD-007 · cancelado e falta não bloqueiam", () => {
    for (const status of ["cancelled", "no_show"] as const) {
      const result = findConflicts(
        { professionalId: "p1", start: at("10:00"), end: at("11:00") },
        ctx({ appointments: [appt({ status })] })
      )
      expect(result).toEqual([])
    }
  })

  it("CA-AGD-003 · RN-AGD-005 · sala exclusiva ocupada por outro profissional", () => {
    const result = findConflicts(
      { professionalId: "p1", roomId: "r1", start: at("10:00"), end: at("11:00") },
      ctx({ room, appointments: [appt({ professionalId: "p2", roomId: "r1" })] })
    )
    expect(types(result)).toEqual(["room_busy"])
  })

  it("sala não exclusiva pode ser compartilhada", () => {
    const result = findConflicts(
      { professionalId: "p1", roomId: "r1", start: at("10:00"), end: at("11:00") },
      ctx({ room: { ...room, exclusive: false }, appointments: [appt({ professionalId: "p2", roomId: "r1" })] })
    )
    expect(result).toEqual([])
  })

  it("RN-AGD-002 · fora da grade e fora do funcionamento", () => {
    const evening = findConflicts({ professionalId: "p1", start: at("18:30"), end: at("19:00") }, ctx())
    expect(types(evening)).toContain("outside_schedule")
    const sunday = findConflicts(
      { professionalId: "p1", start: at("10:00", "2026-11-08"), end: at("11:00", "2026-11-08") },
      ctx()
    )
    expect(types(sunday)).toEqual(expect.arrayContaining(["business_hours", "outside_schedule"]))
  })

  it("RN-AGD-004 · indisponibilidade bloqueia", () => {
    const unavailable = {
      ...professional,
      unavailabilities: [{ id: "u1", start: at("08:00"), end: at("12:00"), reason: "Congresso" }],
    }
    const result = findConflicts(
      { professionalId: "p1", start: at("09:00"), end: at("10:00") },
      ctx({ professional: unavailable })
    )
    expect(types(result)).toContain("unavailable")
  })

  it("RN-AGD-006 · antecedência mínima", () => {
    const result = findConflicts(
      { professionalId: "p1", start: at("07:30"), end: at("08:30") },
      ctx({ now: new Date(at("07:15")) })
    )
    expect(types(result)).toContain("lead_time")
  })

  it("término antes do início é inválido", () => {
    const result = findConflicts({ professionalId: "p1", start: at("11:00"), end: at("10:00") }, ctx())
    expect(types(result)).toEqual(["invalid_range"])
  })
})

describe("AGD — sugestão de horário", () => {
  it("CA-AGD-004 · RN-AGD-008 · sugere o primeiro intervalo livre", () => {
    const context = ctx({ appointments: [appt({})] })
    const suggestion = suggestNextSlot({ professionalId: "p1", start: at("10:00"), end: at("11:00") }, context)
    expect(new Date(suggestion!.start).getTime()).toBe(new Date(at("11:00")).getTime())
    expect(new Date(suggestion!.end).getTime()).toBe(new Date(at("12:00")).getTime())
  })
})
