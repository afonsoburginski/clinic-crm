import { differenceInMonths, differenceInYears } from "date-fns"

import { inClinic, nowInClinic } from "@/domain/clinic-time"

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" })
const dateLongFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "numeric",
  month: "long",
})
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
})
const currencyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatDateLong = (iso: string | Date) => dateLongFmt.format(new Date(iso))
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso))
export const formatCurrency = (cents: number) => currencyFmt.format(cents / 100)

/** Datas de nascimento são datas civis (YYYY-MM-DD), sem fuso. */
export function formatBirthDate(ymd: string) {
  const [y, m, d] = ymd.split("-")
  return `${d}/${m}/${y}`
}

export function formatAge(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  const birth = new Date(y, m - 1, d)
  const today = nowInClinic()
  const years = differenceInYears(today, birth)
  if (years >= 2) return `${years} anos`
  const months = differenceInMonths(today, birth)
  return months === 1 ? "1 mês" : `${months} meses`
}

export function ageInYears(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  return differenceInYears(nowInClinic(), new Date(y, m - 1, d))
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

export function maskCPF(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

export function maskPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2")
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2")
}

export function relativeDayLabel(iso: string) {
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const target = inClinic(iso)
  const today = nowInClinic()
  const tomorrow = new Date(today.getTime() + 86_400_000)
  if (key(target) === key(today)) return "Hoje"
  if (key(target) === key(tomorrow)) return "Amanhã"
  return formatDate(iso)
}

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
