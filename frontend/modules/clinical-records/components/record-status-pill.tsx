import { RECORD_STATUS_LABELS } from "@/domain/clinical-record"
import type { ClinicalRecordStatus } from "@/domain/types"
import { StatePill } from "@/shared/ui/atoms/state-pill"

const TONE = { draft: "warning", finalized: "positive", rectified: "muted" } as const

export function RecordStatusPill({ status }: { status: ClinicalRecordStatus }) {
  return <StatePill tone={TONE[status]}>{RECORD_STATUS_LABELS[status]}</StatePill>
}
