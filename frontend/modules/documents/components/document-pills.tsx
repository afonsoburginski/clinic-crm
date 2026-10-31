import { CLASSIFICATION_LABELS, DOCUMENT_STATUS_LABELS } from "@/domain/documents"
import type { DocumentClassification, DocumentStatus } from "@/domain/types"
import { StatePill } from "@/shared/ui/atoms/state-pill"

const CLASS_TONE = { clinical: "warning", administrative: "muted", financial: "neutral" } as const
const STATUS_TONE = { draft: "warning", issued: "positive", archived: "muted" } as const

export function ClassificationPill({ classification }: { classification: DocumentClassification }) {
  return <StatePill tone={CLASS_TONE[classification]}>{CLASSIFICATION_LABELS[classification]}</StatePill>
}

export function DocumentStatusPill({ status }: { status: DocumentStatus }) {
  return <StatePill tone={STATUS_TONE[status]}>{DOCUMENT_STATUS_LABELS[status]}</StatePill>
}
