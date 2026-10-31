import { TZDate } from "@date-fns/tz"

export const CLINIC_TZ = "America/Sao_Paulo"

export function inClinic(date: string | number | Date) {
  return new TZDate(new Date(date).getTime(), CLINIC_TZ)
}

export function nowInClinic() {
  return TZDate.tz(CLINIC_TZ)
}

/** Builds an ISO instant from a clinic-local date (YYYY-MM-DD) and time (HH:mm). */
export function clinicDateTimeToISO(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number)
  const [h, min] = time.split(":").map(Number)
  return new TZDate(y, m - 1, d, h, min, CLINIC_TZ).toISOString()
}

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

export function minutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

export function clinicDateKey(iso: string | Date) {
  const d = inClinic(iso)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function clinicTimeKey(iso: string | Date) {
  const d = inClinic(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime()
}
