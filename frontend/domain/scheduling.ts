import { INACTIVE_STATUSES } from "./appointment-status"
import { inClinic, minutesOfDay, overlaps, toMinutes } from "./clinic-time"
import type { ConflictDetail } from "./errors"
import type { Appointment, ClinicSettings, Professional, Room } from "./types"

export interface SlotCandidate {
  id?: string
  professionalId: string
  roomId?: string
  start: string
  end: string
}

export interface ConflictContext {
  appointments: Appointment[]
  professional: Professional
  room?: Room
  settings: ClinicSettings
  now?: Date
  ignoreLeadTime?: boolean
}

function isBlocking(appt: Appointment) {
  return !INACTIVE_STATUSES.includes(appt.status)
}

function fitsWeeklySchedule(professional: Professional, start: string, end: string) {
  const s = inClinic(start)
  const e = inClinic(end)
  if (s.getDate() !== e.getDate() && minutesOfDay(e) !== 0) return false
  const startMin = minutesOfDay(s)
  const endMin = minutesOfDay(e) || 24 * 60
  return professional.schedule.some(
    (slot) =>
      slot.weekday === s.getDay() &&
      toMinutes(slot.start) <= startMin &&
      toMinutes(slot.end) >= endMin
  )
}

function fitsBusinessHours(settings: ClinicSettings, start: string, end: string) {
  const s = inClinic(start)
  const day = settings.businessHours.find((d) => d.weekday === s.getDay())
  if (!day || day.closed) return false
  const endMin = minutesOfDay(inClinic(end)) || 24 * 60
  return toMinutes(day.open) <= minutesOfDay(s) && toMinutes(day.close) >= endMin
}

export function findConflicts(candidate: SlotCandidate, ctx: ConflictContext): ConflictDetail[] {
  const conflicts: ConflictDetail[] = []
  const { professional, room, settings } = ctx
  const now = ctx.now ?? new Date()

  if (new Date(candidate.end) <= new Date(candidate.start)) {
    return [{ type: "invalid_range", message: "O horário de término deve ser após o início." }]
  }

  if (!professional.active) {
    conflicts.push({ type: "professional_inactive", message: `${professional.name} está inativo(a).` })
  }

  if (room && !room.active) {
    conflicts.push({ type: "room_inactive", message: `A sala ${room.name} está inativa.` })
  }

  if (!ctx.ignoreLeadTime) {
    const leadMs = settings.minLeadMinutes * 60_000
    if (new Date(candidate.start).getTime() - now.getTime() < leadMs) {
      conflicts.push({
        type: "lead_time",
        message: `Agendamentos exigem antecedência mínima de ${settings.minLeadMinutes} min.`,
      })
    }
  }

  if (!fitsBusinessHours(settings, candidate.start, candidate.end)) {
    conflicts.push({ type: "business_hours", message: "Fora do horário de funcionamento da clínica." })
  }

  if (!fitsWeeklySchedule(professional, candidate.start, candidate.end)) {
    conflicts.push({
      type: "outside_schedule",
      message: `Fora da grade de atendimento de ${professional.name}.`,
    })
  }

  const unavailable = professional.unavailabilities.find((u) =>
    overlaps(candidate.start, candidate.end, u.start, u.end)
  )
  if (unavailable) {
    conflicts.push({
      type: "unavailable",
      message: `${professional.name} está indisponível neste período (${unavailable.reason}).`,
    })
  }

  for (const appt of ctx.appointments) {
    if (appt.id === candidate.id || !isBlocking(appt)) continue
    if (!overlaps(candidate.start, candidate.end, appt.start, appt.end)) continue

    if (appt.professionalId === candidate.professionalId) {
      conflicts.push({
        type: "professional_busy",
        message:
          appt.kind === "block"
            ? `${professional.name} tem um bloqueio de agenda neste horário.`
            : `${professional.name} já tem um atendimento neste horário.`,
      })
    } else if (room?.exclusive && appt.roomId && appt.roomId === candidate.roomId) {
      conflicts.push({ type: "room_busy", message: `A sala ${room.name} já está ocupada neste horário.` })
    }
  }

  const unique = new Map(conflicts.map((c) => [c.type, c]))
  return [...unique.values()]
}

const STEP_MIN = 15
const SEARCH_DAYS = 14

export function suggestNextSlot(candidate: SlotCandidate, ctx: ConflictContext) {
  const durationMs = new Date(candidate.end).getTime() - new Date(candidate.start).getTime()
  const earliest = Math.max(
    new Date(candidate.start).getTime(),
    (ctx.now ?? new Date()).getTime() + ctx.settings.minLeadMinutes * 60_000
  )
  let cursor = Math.ceil(earliest / (STEP_MIN * 60_000)) * STEP_MIN * 60_000
  const limit = cursor + SEARCH_DAYS * 24 * 60 * 60_000

  while (cursor < limit) {
    const start = new Date(cursor).toISOString()
    const end = new Date(cursor + durationMs).toISOString()
    if (findConflicts({ ...candidate, start, end }, ctx).length === 0) return { start, end }
    cursor += STEP_MIN * 60_000
  }
  return undefined
}
