import { ENTRY_STATUS_LABELS } from "@/domain/financial"
import type { FinancialEntryStatus } from "@/domain/types"
import { StatePill } from "@/shared/ui/atoms/state-pill"

const TONE = { open: "neutral", partial: "neutral", paid: "positive", overdue: "warning", cancelled: "muted" } as const

export function EntryStatusPill({ status }: { status: FinancialEntryStatus }) {
  return <StatePill tone={TONE[status]}>{ENTRY_STATUS_LABELS[status]}</StatePill>
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

/** `2026-04` → `abril/2026`. */
export function competenceLabel(competence: string) {
  const [year, month] = competence.split("-")
  return `${MONTHS[Number(month) - 1] ?? month}/${year}`
}
