import { ForbiddenError, ValidationError } from "./errors"
import { can } from "./permissions"
import type { Assessment, AssessmentStageStatus, AssessmentStatus, User } from "./types"

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
}

export const STAGE_STATUS_LABELS: Record<AssessmentStageStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  done: "Concluída",
}

/** RN-AVA-002 */
const STAGE_TRANSITIONS: Record<AssessmentStageStatus, AssessmentStageStatus[]> = {
  pending: ["in_progress"],
  in_progress: ["pending", "done"],
  done: [],
}

export function canTransitionStage(from: AssessmentStageStatus, to: AssessmentStageStatus) {
  return STAGE_TRANSITIONS[from].includes(to)
}

/** RN-AVA-003: interpretação é exclusiva do perfil clínico. */
export function canInterpret(user: User | null | undefined) {
  return can(user, "assessments:interpret")
}

/**
 * RN-AVA-001: o responsável precisa poder operar o registro — profissional ativo,
 * com conta de perfil clínico e vínculo com o paciente. Vale também para o plano ABA.
 */
export function assertResponsibleOperable(candidate: { active: boolean; hasClinicalAccount: boolean; linkedToPatient: boolean }) {
  if (!candidate.active || !candidate.hasClinicalAccount || !candidate.linkedToPatient) {
    throw new ValidationError("Selecione um profissional responsável ativo e vinculado a este paciente.")
  }
}

function assertOpen(a: Assessment) {
  if (a.status !== "in_progress") throw new ValidationError("Avaliação concluída ou cancelada é somente leitura.")
}

function assertResponsible(a: Assessment, user: User) {
  if (!user.professionalId || user.professionalId !== a.responsibleProfessionalId) {
    throw new ForbiddenError("Somente o profissional responsável pode concluir ou cancelar a avaliação.")
  }
}

function withEvent(a: Assessment, user: User, at: string, summary: string): Assessment {
  return { ...a, updatedAt: at, history: [...a.history, { at, actorId: user.id, actorName: user.name, summary }] }
}

export function createAssessment(
  input: {
    id: string
    patientId: string
    title: string
    purpose: string
    responsibleProfessionalId: string
    stages: string[]
  },
  newId: () => string,
  user: User,
  at: string
): Assessment {
  const names = input.stages.map((s) => s.trim()).filter(Boolean)
  if (!names.length) throw new ValidationError("Inclua ao menos uma etapa.")
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    throw new ValidationError("Os nomes das etapas não podem se repetir.")
  }
  const base: Assessment = {
    id: input.id,
    patientId: input.patientId,
    title: input.title.trim(),
    purpose: input.purpose.trim(),
    responsibleProfessionalId: input.responsibleProfessionalId,
    status: "in_progress",
    stages: names.map((name) => ({ id: newId(), name, status: "pending" })),
    interpretations: [],
    history: [],
    createdBy: user.id,
    createdAt: at,
    updatedAt: at,
  }
  return withEvent(base, user, at, "Avaliação aberta")
}

export function setStageStatus(a: Assessment, stageId: string, to: AssessmentStageStatus, user: User, at: string): Assessment {
  assertOpen(a)
  const stage = a.stages.find((s) => s.id === stageId)
  if (!stage) throw new ValidationError("Etapa não encontrada.")
  if (!canTransitionStage(stage.status, to)) {
    throw new ValidationError(`Não é possível mudar a etapa de "${STAGE_STATUS_LABELS[stage.status]}" para "${STAGE_STATUS_LABELS[to]}".`)
  }
  const next = {
    ...a,
    stages: a.stages.map((s) => (s.id === stageId ? { ...s, status: to, doneAt: to === "done" ? at : undefined } : s)),
  }
  return withEvent(next, user, at, `Etapa "${stage.name}": ${STAGE_STATUS_LABELS[stage.status]} → ${STAGE_STATUS_LABELS[to]}`)
}

/** RN-AVA-003: acrescenta nova versão; as anteriores permanecem. */
export function addInterpretation(a: Assessment, text: string, id: string, user: User, at: string): Assessment {
  if (!canInterpret(user)) throw new ForbiddenError("Interpretações são restritas ao perfil clínico.")
  assertOpen(a)
  const clean = text.trim()
  if (clean.length < 20) throw new ValidationError("A interpretação precisa de ao menos 20 caracteres.")
  const version = a.interpretations.length + 1
  const next = {
    ...a,
    interpretations: [...a.interpretations, { id, version, text: clean, authorId: user.id, authorName: user.name, at }],
  }
  return withEvent(next, user, at, `Interpretação registrada (versão ${version})`)
}

/** RN-AVA-004 */
export function completeAssessment(a: Assessment, user: User, at: string): Assessment {
  assertResponsible(a, user)
  assertOpen(a)
  if (a.stages.some((s) => s.status !== "done")) throw new ValidationError("Conclua todas as etapas antes de finalizar a avaliação.")
  if (!a.interpretations.length) throw new ValidationError("Registre ao menos uma interpretação antes de concluir.")
  return withEvent({ ...a, status: "completed", completedAt: at }, user, at, "Avaliação concluída")
}

/** RN-AVA-004/005 */
export function cancelAssessment(a: Assessment, reason: string, user: User, at: string): Assessment {
  assertResponsible(a, user)
  assertOpen(a)
  const clean = reason.trim()
  if (clean.length < 5) throw new ValidationError("Informe o motivo do cancelamento (mínimo 5 caracteres).")
  return withEvent({ ...a, status: "cancelled", cancelReason: clean }, user, at, "Avaliação cancelada")
}
