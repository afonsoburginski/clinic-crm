import type {
  AbaChange,
  AbaGoal,
  AbaGoalStatus,
  AbaPlan,
  AbaPlanStatus,
  AbaSession,
  Assessment,
  AssessmentEvent,
  AssessmentStageStatus,
  AssessmentStatus,
  ClinicalRecord,
  ClinicalRecordEvent,
  ClinicalRecordKind,
  ClinicalRecordStatus,
} from "@/domain/types"

import { count, isRow, listOf, optional, text, type Row } from "./backend-mappers"
import { actorNameOf } from "./helpers"

/**
 * Tradução dos recursos clínicos que a API guarda como JSON (`api_resources`) para os tipos de
 * `domain/types`. O backend usa outros nomes e valores (`type`, `parentId`, `superseded`, `completed`,
 * `criteria`…): a conversão mora aqui, nos dois sentidos quando o valor também é enviado.
 */

type NameOf = (actorId: string | undefined) => string

// ---------------------------------------------------------------- prontuário

const KIND_BY_TYPE: Record<string, ClinicalRecordKind> = {
  anamnesis: "anamnesis",
  progress: "evolution",
  clinical_document: "document",
}

const TYPE_BY_KIND: Record<ClinicalRecordKind, string> = {
  anamnesis: "anamnesis",
  evolution: "progress",
  document: "clinical_document",
}

const RECORD_STATUS: Record<string, ClinicalRecordStatus> = { draft: "draft", finalized: "finalized", superseded: "rectified" }

export const recordTypeOf = (kind: ClinicalRecordKind) => TYPE_BY_KIND[kind]

/** `id → id da primeira versão`, seguindo `parentId`; pai ausente ou ciclo faz do registro a raiz. */
export function recordRoots(rows: Row[]): Map<string, string> {
  const byId = new Map(rows.map((row) => [text(row.id), row]))
  const roots = new Map<string, string>()
  for (const row of rows) {
    const seen = new Set<string>()
    let current = row
    while (optional(current.parentId) && !seen.has(text(current.id))) {
      seen.add(text(current.id))
      const parent = byId.get(text(current.parentId))
      if (!parent) break
      current = parent
    }
    roots.set(text(row.id), text(current.id))
  }
  return roots
}

export function toClinicalRecord(
  raw: Row,
  context: { rootId?: string; supersededById?: string; nameOf?: NameOf } = {}
): ClinicalRecord {
  const nameOf = context.nameOf ?? actorNameOf
  const id = text(raw.id)
  const createdAt = text(raw.createdAt)
  const status = RECORD_STATUS[text(raw.status)] ?? "draft"
  const authorId = text(raw.createdBy)
  const authorName = optional(raw.authorName) ?? nameOf(authorId)
  const rectifiesId = optional(raw.parentId)
  const finalizedAt = status === "draft" ? undefined : optional(raw.finalizedAt)
  const updatedAt = text(raw.updatedAt) || createdAt
  const event = (action: ClinicalRecordEvent["action"], at: string): ClinicalRecordEvent => ({ at, actorId: authorId, actorName: authorName, action })
  return {
    id,
    rootId: context.rootId ?? id,
    version: count(raw.version, 1),
    patientId: text(raw.patientId),
    kind: KIND_BY_TYPE[text(raw.type)] ?? "evolution",
    title: text(raw.title),
    content: text(raw.content),
    appointmentId: optional(raw.appointmentId),
    status,
    rectifiesId,
    rectificationReason: optional(raw.rectificationReason),
    supersededById: status === "rectified" ? context.supersededById : undefined,
    authorId,
    authorName,
    professionalId: text(raw.professionalId),
    createdAt,
    updatedAt,
    finalizedAt,
    history: [
      event(rectifiesId ? "rectification_started" : "created", createdAt),
      ...(updatedAt > createdAt && updatedAt !== finalizedAt && status === "draft" ? [event("updated", updatedAt)] : []),
      ...(finalizedAt ? [event("finalized", finalizedAt)] : []),
    ],
  }
}

/** Lista de registros de um ou mais pacientes, com raiz e substituição resolvidas pela cadeia de versões. */
export function toClinicalRecords(rows: Row[], nameOf?: NameOf): ClinicalRecord[] {
  const roots = recordRoots(rows)
  const successor = new Map(rows.filter((row) => optional(row.parentId)).map((row) => [text(row.parentId), text(row.id)]))
  return rows.map((row) =>
    toClinicalRecord(row, { rootId: roots.get(text(row.id)), supersededById: successor.get(text(row.id)), nameOf })
  )
}

// ---------------------------------------------------------------- avaliações

const STAGE_STATUS: Record<string, AssessmentStageStatus> = { pending: "pending", in_progress: "in_progress", completed: "done", done: "done" }

/** A API chama a etapa concluída de `completed`. */
export const stageStatusToStored = (status: AssessmentStageStatus) => (status === "done" ? "completed" : status)

const ASSESSMENT_STATUS: Record<string, AssessmentStatus> = {
  pending: "in_progress",
  in_progress: "in_progress",
  completed: "completed",
  cancelled: "cancelled",
}

const EVENT_SUMMARY: Record<string, string> = {
  stages: "Etapa atualizada",
  interpretations: "Interpretação registrada",
  complete: "Avaliação concluída",
  cancel: "Avaliação cancelada",
}

export function toAssessment(raw: Row, nameOf: NameOf = actorNameOf): Assessment {
  const createdAt = text(raw.createdAt)
  const createdBy = text(raw.createdBy)
  const events = listOf(raw.events)
  const history: AssessmentEvent[] = [
    { at: createdAt, actorId: createdBy, actorName: optional(raw.createdByName) ?? nameOf(createdBy), summary: "Avaliação aberta" },
    ...events.map((event) => ({
      at: text(event.at),
      actorId: text(event.actor),
      actorName: nameOf(optional(event.actor)),
      summary: EVENT_SUMMARY[text(event.action)] ?? "Avaliação alterada",
    })),
  ]
  const status = ASSESSMENT_STATUS[text(raw.status)] ?? "in_progress"
  const lastAt = history.reduce((latest, entry) => (entry.at > latest ? entry.at : latest), text(raw.updatedAt) || createdAt)
  return {
    id: text(raw.id),
    patientId: text(raw.patientId),
    title: text(raw.title),
    purpose: text(raw.purpose),
    responsibleProfessionalId: text(raw.responsibleProfessionalId),
    status,
    stages: listOf(raw.stages).map((stage) => {
      const stageStatus = STAGE_STATUS[text(stage.status)] ?? "pending"
      return { id: text(stage.id), name: text(stage.name), status: stageStatus, doneAt: stageStatus === "done" ? optional(stage.doneAt) : undefined }
    }),
    interpretations: listOf(raw.interpretations).map((item) => ({
      id: text(item.id),
      version: count(item.version, 1),
      text: text(item.content ?? item.text),
      authorId: text(item.createdBy),
      authorName: nameOf(optional(item.createdBy)),
      at: text(item.at),
    })),
    history,
    cancelReason: optional(raw.cancelReason),
    createdBy,
    createdAt,
    updatedAt: lastAt,
    completedAt: status === "completed" ? optional(events.find((event) => event.action === "complete")?.at) : undefined,
  }
}

// ---------------------------------------------------------------- ABA

const GOAL_STATUS: Record<string, AbaGoalStatus> = {
  active: "active",
  achieved: "achieved",
  completed: "achieved",
  discontinued: "discontinued",
}

export function toAbaGoal(raw: Row): AbaGoal {
  const criterionText = text(raw.criterionText ?? raw.criteria)
  return {
    id: text(raw.id),
    title: text(raw.title) || criterionText,
    description: optional(raw.description),
    criterionText,
    targetPercent: count(raw.targetPercent),
    consecutiveSessions: count(raw.consecutiveSessions, 1),
    status: GOAL_STATUS[text(raw.status)] ?? "active",
    statusReason: optional(raw.statusReason),
  }
}

/** O formato que a API guarda e valida (`criteria` é o que ela exige; `criterionText` mantém o nome da UI). */
export function goalToStored(goal: Pick<AbaGoal, "title" | "description" | "criterionText" | "targetPercent" | "consecutiveSessions">) {
  return {
    title: goal.title,
    description: goal.description,
    criteria: goal.criterionText,
    criterionText: goal.criterionText,
    targetPercent: goal.targetPercent,
    consecutiveSessions: goal.consecutiveSessions,
  }
}

const PLAN_STATUS: Record<string, AbaPlanStatus> = { draft: "draft", active: "active", closed: "closed" }

function toAbaChange(raw: Row): AbaChange {
  return {
    at: text(raw.at),
    actorId: text(raw.actorId),
    actorName: text(raw.actorName, "Usuário da clínica"),
    summary: text(raw.summary),
    changes: isRow(raw.changes)
      ? (raw.changes as Record<string, { from: unknown; to: unknown }>)
      : undefined,
  }
}

export function toAbaPlan(raw: Row): AbaPlan {
  const createdAt = text(raw.createdAt)
  return {
    id: text(raw.id),
    patientId: text(raw.patientId),
    title: text(raw.title),
    startDate: text(raw.startDate),
    reviewDate: optional(raw.reviewDate),
    responsibleProfessionalId: text(raw.responsibleProfessionalId),
    status: PLAN_STATUS[text(raw.status)] ?? "draft",
    closeReason: optional(raw.closeReason),
    goals: listOf(raw.goals).map(toAbaGoal),
    changeLog: listOf(raw.changeLog).map(toAbaChange),
    createdBy: text(raw.createdBy),
    createdAt,
    updatedAt: text(raw.updatedAt) || createdAt,
  }
}

export function toAbaSession(raw: Row, nameOf: NameOf = actorNameOf): AbaSession {
  const createdAt = text(raw.createdAt)
  const authorId = text(raw.createdBy)
  const voided = raw.voided === true
  return {
    id: text(raw.id),
    planId: text(raw.planId),
    patientId: text(raw.patientId),
    date: text(raw.date),
    professionalId: text(raw.professionalId),
    authorId,
    authorName: optional(raw.authorName) ?? nameOf(authorId),
    measures: listOf(raw.measures).map((measure) => ({
      goalId: text(measure.goalId),
      trials: count(measure.trials),
      correct: count(measure.correct),
      note: optional(measure.note),
    })),
    notes: optional(raw.notes),
    createdAt,
    voidedAt: voided ? optional(raw.voidedAt) ?? createdAt : undefined,
    voidedBy: voided ? optional(raw.voidedBy) : undefined,
    voidReason: voided ? optional(raw.voidReason) : undefined,
  }
}
