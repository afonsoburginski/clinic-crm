import type { PatientStatus } from "@/domain/types"
import { StatePill } from "@/shared/ui/atoms/state-pill"

import { PATIENT_STATUS_LABELS } from "../queries"

const TONE = { active: "positive", inactive: "warning", archived: "muted" } as const

export function PatientStatusPill({ status }: { status: PatientStatus }) {
  return <StatePill tone={TONE[status]}>{PATIENT_STATUS_LABELS[status]}</StatePill>
}
