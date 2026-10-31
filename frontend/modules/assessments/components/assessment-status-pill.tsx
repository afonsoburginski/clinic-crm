import { ASSESSMENT_STATUS_LABELS, STAGE_STATUS_LABELS } from "@/domain/assessment"
import type { AssessmentStageStatus, AssessmentStatus } from "@/domain/types"
import { StatePill } from "@/shared/ui/atoms/state-pill"

const STATUS_TONE = { in_progress: "warning", completed: "positive", cancelled: "muted" } as const
const STAGE_TONE = { pending: "muted", in_progress: "warning", done: "positive" } as const

export function AssessmentStatusPill({ status }: { status: AssessmentStatus }) {
  return <StatePill tone={STATUS_TONE[status]}>{ASSESSMENT_STATUS_LABELS[status]}</StatePill>
}

export function StageStatusPill({ status }: { status: AssessmentStageStatus }) {
  return <StatePill tone={STAGE_TONE[status]}>{STAGE_STATUS_LABELS[status]}</StatePill>
}
