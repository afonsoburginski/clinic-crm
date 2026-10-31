import { GOAL_STATUS_LABELS, PLAN_STATUS_LABELS } from "@/domain/aba"
import type { AbaGoalStatus, AbaPlanStatus } from "@/domain/types"
import { StatePill } from "@/shared/ui/atoms/state-pill"

const PLAN_TONE = { draft: "warning", active: "positive", closed: "muted" } as const
const GOAL_TONE = { active: "neutral", achieved: "positive", discontinued: "muted" } as const

export function PlanStatusPill({ status }: { status: AbaPlanStatus }) {
  return <StatePill tone={PLAN_TONE[status]}>{PLAN_STATUS_LABELS[status]}</StatePill>
}

export function GoalStatusPill({ status }: { status: AbaGoalStatus }) {
  return <StatePill tone={GOAL_TONE[status]}>{GOAL_STATUS_LABELS[status]}</StatePill>
}
