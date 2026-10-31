import { clinicDateKey } from "@/domain/clinic-time"

/**
 * Lógica pura do seletor de período. Datas civis são sempre `AAAA-MM-DD` (sem fuso): "hoje" vem do
 * relógio da clínica (`now` injetável nos testes) e a aritmética usa UTC para não escorregar um dia.
 */
export interface DateRangeValue {
  from?: string
  to?: string
}

export type PresetId = "today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "thisYear"

export const PRESET_LABELS: Record<PresetId, string> = {
  today: "Hoje",
  last7: "Últimos 7 dias",
  last30: "Últimos 30 dias",
  thisMonth: "Este mês",
  lastMonth: "Mês passado",
  thisYear: "Este ano",
}

export const PRESET_IDS = Object.keys(PRESET_LABELS) as PresetId[]

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/
const pad = (n: number) => String(n).padStart(2, "0")

/** Data civil real (recusa `2026-02-30`). */
export function isYmd(value: unknown): value is string {
  if (typeof value !== "string") return false
  const m = YMD.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

const utc = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const key = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`

export const addDaysYmd = (ymd: string, days: number) => key(new Date(utc(ymd).getTime() + days * 86_400_000))
export const startOfMonthYmd = (ymd: string) => `${ymd.slice(0, 7)}-01`
export function endOfMonthYmd(ymd: string) {
  const [y, m] = ymd.split("-").map(Number)
  return key(new Date(Date.UTC(y, m, 0)))
}
export const startOfYearYmd = (ymd: string) => `${ymd.slice(0, 4)}-01-01`
export const endOfYearYmd = (ymd: string) => `${ymd.slice(0, 4)}-12-31`

/** Hoje no fuso da clínica. */
export const todayKey = (now: Date = new Date()) => clinicDateKey(now)

/** "Este mês" e "Este ano" cobrem o período inteiro (vencimentos futuros entram); os demais terminam hoje. */
export function presetRange(id: PresetId, today: string): Required<DateRangeValue> {
  switch (id) {
    case "today":
      return { from: today, to: today }
    case "last7":
      return { from: addDaysYmd(today, -6), to: today }
    case "last30":
      return { from: addDaysYmd(today, -29), to: today }
    case "thisMonth":
      return { from: startOfMonthYmd(today), to: endOfMonthYmd(today) }
    case "lastMonth": {
      const lastDayOfPrevious = addDaysYmd(startOfMonthYmd(today), -1)
      return { from: startOfMonthYmd(lastDayOfPrevious), to: lastDayOfPrevious }
    }
    case "thisYear":
      return { from: startOfYearYmd(today), to: endOfYearYmd(today) }
  }
}

/** Mantém só datas válidas e troca as pontas quando vierem invertidas. */
export function normalizeRange(range: DateRangeValue | undefined | null): DateRangeValue {
  const from = isYmd(range?.from) ? range.from : undefined
  const to = isYmd(range?.to) ? range.to : undefined
  if (from && to && from > to) return { from: to, to: from }
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) }
}

export const isEmptyRange = (range: DateRangeValue | undefined | null) => !isYmd(range?.from) && !isYmd(range?.to)

export const sameRange = (a: DateRangeValue | undefined, b: DateRangeValue | undefined) => {
  const [x, y] = [normalizeRange(a), normalizeRange(b)]
  return x.from === y.from && x.to === y.to
}

/** O preset cujo intervalo é exatamente o valor atual (para marcar o botão ativo). */
export function matchPreset(range: DateRangeValue | undefined, today: string): PresetId | undefined {
  if (isEmptyRange(range)) return undefined
  return PRESET_IDS.find((id) => sameRange(range, presetRange(id, today)))
}

export const formatYmd = (ymd: string) => {
  const [y, m, d] = ymd.split("-")
  return `${d}/${m}/${y}`
}

export function formatRangeLabel(range: DateRangeValue | undefined, empty = "Período"): string {
  const { from, to } = normalizeRange(range)
  if (from && to) return from === to ? formatYmd(from) : `${formatYmd(from)} – ${formatYmd(to)}`
  if (from) return `A partir de ${formatYmd(from)}`
  if (to) return `Até ${formatYmd(to)}`
  return empty
}

/** Data civil de um valor de linha: `AAAA-MM-DD` passa direto; um instante ISO vira o dia no fuso da clínica. */
export function toDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  if (isYmd(value)) return value
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : clinicDateKey(new Date(time))
}

export function rangeContains(range: DateRangeValue | undefined, value: unknown): boolean {
  const { from, to } = normalizeRange(range)
  if (!from && !to) return true
  const day = toDateKey(value)
  if (!day) return false
  return (!from || day >= from) && (!to || day <= to)
}

// ---------------------------------------------------------------- ponte com o react-day-picker (Date local)

export const ymdToDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y, m - 1, d)
}
export const dateToYmd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export function toPickerRange(range: DateRangeValue | undefined): { from: Date | undefined; to: Date | undefined } | undefined {
  const { from, to } = normalizeRange(range)
  if (!from && !to) return undefined
  return { from: from ? ymdToDate(from) : undefined, to: to ? ymdToDate(to) : undefined }
}

export function fromPickerRange(range: { from?: Date; to?: Date } | undefined): DateRangeValue {
  if (!range) return {}
  return normalizeRange({ from: range.from ? dateToYmd(range.from) : undefined, to: range.to ? dateToYmd(range.to) : undefined })
}
