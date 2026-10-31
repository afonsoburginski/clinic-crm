import { clinicDateKey, clinicDateTimeToISO, clinicTimeKey, toMinutes } from "@/domain/clinic-time"
import type { Appointment } from "@/domain/types"
import { WEEKDAY_SHORT } from "@/shared/lib/format"

/** Datas da agenda são chaves YYYY-MM-DD no fuso da clínica; a aritmética é feita em UTC puro. */
function keyToUTC(key: string) {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(key: string, days: number) {
  const date = keyToUTC(key)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export const weekdayOf = (key: string) => keyToUTC(key).getUTCDay()

export function startOfWeek(key: string) {
  return addDays(key, -((weekdayOf(key) + 6) % 7))
}

export const todayKey = () => clinicDateKey(new Date())

export function dayKeys(fromKey: string, count: number) {
  return Array.from({ length: count }, (_, i) => addDays(fromKey, i))
}

export function rangeISO(fromKey: string, days: number) {
  return { from: clinicDateTimeToISO(fromKey, "00:00"), to: clinicDateTimeToISO(addDays(fromKey, days), "00:00") }
}

export function dayLabel(key: string) {
  const [, m, d] = key.split("-")
  return { weekday: WEEKDAY_SHORT[weekdayOf(key)], date: `${d}/${m}` }
}

export function rangeLabel(keys: string[]) {
  const fmt = (key: string, withYear = false) =>
    keyToUTC(key).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: withYear ? "numeric" : undefined, timeZone: "UTC" })
  if (keys.length === 1) {
    return keyToUTC(keys[0]).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
  }
  return `${fmt(keys[0])} – ${fmt(keys[keys.length - 1], true)}`
}

export const startOfMonth = (key: string) => `${key.slice(0, 7)}-01`

export function addMonths(key: string, months: number) {
  const date = keyToUTC(startOfMonth(key))
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().slice(0, 10)
}

/** Semanas (seg–sáb, como a agenda semanal) que cobrem o mês inteiro de `key`. */
export function monthWeeks(key: string) {
  const first = startOfMonth(key)
  const last = addDays(addMonths(first, 1), -1)
  const weeks: string[][] = []
  for (let monday = startOfWeek(first); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(dayKeys(monday, 6))
  }
  return weeks
}

export function monthLabel(key: string) {
  return keyToUTC(key).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
}

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

export interface PositionedAppointment {
  appointment: Appointment
  startMin: number
  endMin: number
  lane: number
  lanes: number
}

/** Distribui eventos sobrepostos em faixas lado a lado dentro de cada grupo de sobreposição. */
export function layoutDay(appointments: Appointment[]): PositionedAppointment[] {
  const items = appointments
    .map((appointment) => ({
      appointment,
      startMin: toMinutes(clinicTimeKey(appointment.start)),
      endMin: toMinutes(clinicTimeKey(appointment.end)) || 24 * 60,
      lane: 0,
      lanes: 1,
    }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  let group: typeof items = []
  let groupEnd = -1
  const flush = () => {
    const laneEnds: number[] = []
    for (const item of group) {
      const lane = laneEnds.findIndex((end) => end <= item.startMin)
      item.lane = lane === -1 ? laneEnds.length : lane
      laneEnds[item.lane] = item.endMin
    }
    for (const item of group) item.lanes = laneEnds.length
    group = []
  }

  for (const item of items) {
    if (item.startMin >= groupEnd && group.length) flush()
    group.push(item)
    groupEnd = Math.max(groupEnd, item.endMin)
  }
  if (group.length) flush()
  return items
}
