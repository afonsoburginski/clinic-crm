import { ValidationError } from "./errors"
import type { AbaChange, AbaGoal, AbaGoalStatus, AbaMeasure, AbaPlan, AbaSession, User } from "./types"

export const PLAN_STATUS_LABELS = { draft: "Rascunho", active: "Ativo", closed: "Encerrado" } as const
export const GOAL_STATUS_LABELS: Record<AbaGoalStatus, string> = {
  active: "Ativo",
  achieved: "Alcançado",
  discontinued: "Descontinuado",
}

/** Percentual de acertos com uma casa decimal, calculado do que foi registrado. */
export function measurePercent(m: Pick<AbaMeasure, "trials" | "correct">) {
  return Math.round((m.correct / m.trials) * 1000) / 10
}

export interface GoalMeasurePoint {
  sessionId: string
  date: string
  trials: number
  correct: number
  percent: number
}

export interface GoalProgress {
  goalId: string
  points: GoalMeasurePoint[]
  /** `null` quando não há medidas — nunca zero por padrão (RN-ABA-004). */
  lastPercent: number | null
  criterionMet: boolean
  state: "no_data" | "in_progress" | "criterion_met"
}

/** RN-ABA-004/005: progresso vem só de medidas registradas e não anuladas. */
export function goalProgress(goal: AbaGoal, sessions: AbaSession[]): GoalProgress {
  const points = sessions
    .filter((s) => !s.voidedAt)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .flatMap((s) =>
      s.measures
        .filter((m) => m.goalId === goal.id)
        .map((m) => ({ sessionId: s.id, date: s.date, trials: m.trials, correct: m.correct, percent: measurePercent(m) }))
    )
  const last = points.slice(-goal.consecutiveSessions)
  const criterionMet =
    points.length >= goal.consecutiveSessions && last.every((p) => p.percent >= goal.targetPercent)
  return {
    goalId: goal.id,
    points,
    lastPercent: points.length ? points[points.length - 1].percent : null,
    criterionMet,
    state: !points.length ? "no_data" : criterionMet ? "criterion_met" : "in_progress",
  }
}

function change(user: User, at: string, summary: string, changes?: AbaChange["changes"]): AbaChange {
  return { at, actorId: user.id, actorName: user.name, summary, changes }
}

function diffFields(before: object, after: object, fields: string[]) {
  const out: NonNullable<AbaChange["changes"]> = {}
  const b = before as Record<string, unknown>
  const a = after as Record<string, unknown>
  for (const f of fields) if (b[f] !== a[f]) out[f] = { from: b[f], to: a[f] }
  return Object.keys(out).length ? out : undefined
}

function logged(plan: AbaPlan, entry: AbaChange): AbaPlan {
  return { ...plan, updatedAt: entry.at, changeLog: [...plan.changeLog, entry] }
}

/** RN-ABA-008 */
function assertEditable(plan: AbaPlan) {
  if (plan.status === "closed") throw new ValidationError("Plano encerrado é somente leitura.")
}

export interface GoalFields {
  title: string
  description?: string
  criterionText: string
  targetPercent: number
  consecutiveSessions: number
}

const GOAL_FIELDS = ["title", "description", "criterionText", "targetPercent", "consecutiveSessions"]

export function createPlan(
  input: { id: string; patientId: string; title: string; startDate: string; reviewDate?: string; responsibleProfessionalId: string },
  user: User,
  at: string
): AbaPlan {
  const plan: AbaPlan = {
    ...input,
    status: "draft",
    goals: [],
    changeLog: [],
    createdBy: user.id,
    createdAt: at,
    updatedAt: at,
  }
  return logged(plan, change(user, at, "Plano criado"))
}

export function updatePlan(
  plan: AbaPlan,
  patch: { title: string; startDate: string; reviewDate?: string; responsibleProfessionalId: string },
  user: User,
  at: string
): AbaPlan {
  assertEditable(plan)
  const next = { ...plan, ...patch }
  const changes = diffFields(plan, next, ["title", "startDate", "reviewDate", "responsibleProfessionalId"])
  return logged(next, change(user, at, "Dados do plano alterados", changes))
}

/**
 * RN-ABA-010: com medidas válidas registradas, a meta (% e sessões consecutivas)
 * não pode ser reduzida — evita afrouxar o critério depois de ver os dados.
 * `sessions` são as sessões do plano.
 */
export function saveGoal(
  plan: AbaPlan,
  fields: GoalFields,
  goalId: string | undefined,
  newId: string,
  user: User,
  at: string,
  sessions: AbaSession[] = []
): AbaPlan {
  assertEditable(plan)
  if (fields.criterionText.trim().length < 10) throw new ValidationError("Todo objetivo precisa de um critério explícito (mínimo 10 caracteres).")
  if (fields.targetPercent < 1 || fields.targetPercent > 100) throw new ValidationError("A meta deve estar entre 1% e 100%.")
  if (fields.consecutiveSessions < 1) throw new ValidationError("Informe ao menos 1 sessão consecutiva.")
  if (!goalId) {
    const goal: AbaGoal = { ...fields, id: newId, status: "active" }
    return logged({ ...plan, goals: [...plan.goals, goal] }, change(user, at, `Objetivo adicionado: ${fields.title}`))
  }
  const before = plan.goals.find((g) => g.id === goalId)
  if (!before) throw new ValidationError("Objetivo não encontrado.")
  if (before.status !== "active") throw new ValidationError("Objetivo alcançado ou descontinuado não pode ser editado.")
  if (
    (fields.targetPercent < before.targetPercent || fields.consecutiveSessions < before.consecutiveSessions) &&
    goalProgress(before, sessions).points.length
  ) {
    throw new ValidationError("A meta e as sessões consecutivas não podem ser reduzidas depois que há medidas registradas.")
  }
  const after = { ...before, ...fields }
  return logged(
    { ...plan, goals: plan.goals.map((g) => (g.id === goalId ? after : g)) },
    change(user, at, `Objetivo alterado: ${after.title}`, diffFields(before, after, GOAL_FIELDS))
  )
}

/** RN-ABA-006: só objetivo `ativo` muda, e apenas para `alcançado` ou `descontinuado`; o estado terminal é definitivo. */
export function setGoalStatus(
  plan: AbaPlan,
  goalId: string,
  to: AbaGoalStatus,
  reason: string,
  sessions: AbaSession[],
  user: User,
  at: string
): AbaPlan {
  assertEditable(plan)
  const goal = plan.goals.find((g) => g.id === goalId)
  if (!goal) throw new ValidationError("Objetivo não encontrado.")
  if (goal.status === to) throw new ValidationError("O objetivo já está nessa situação.")
  if (goal.status !== "active") {
    throw new ValidationError("Objetivo alcançado ou descontinuado é definitivo: não pode ser reativado nem alterado.")
  }
  if (to !== "achieved" && to !== "discontinued") {
    throw new ValidationError("Um objetivo ativo só pode ser marcado como alcançado ou descontinuado.")
  }
  const clean = reason.trim()
  if (to === "achieved" && !goalProgress(goal, sessions).criterionMet) {
    throw new ValidationError("O critério de alcance ainda não foi atingido pelas medidas registradas.")
  }
  if (to === "discontinued" && clean.length < 5) throw new ValidationError("Informe o motivo da descontinuação (mínimo 5 caracteres).")
  const after: AbaGoal = { ...goal, status: to, statusReason: clean || undefined }
  return logged(
    { ...plan, goals: plan.goals.map((g) => (g.id === goalId ? after : g)) },
    change(user, at, `Objetivo "${goal.title}": ${GOAL_STATUS_LABELS[goal.status]} → ${GOAL_STATUS_LABELS[to]}`, {
      status: { from: goal.status, to },
      ...(clean ? { statusReason: { from: goal.statusReason, to: clean } } : {}),
    })
  )
}

/** RN-ABA-001 */
export function activatePlan(plan: AbaPlan, user: User, at: string): AbaPlan {
  if (plan.status !== "draft") throw new ValidationError("Somente planos em rascunho podem ser ativados.")
  if (!plan.goals.some((g) => g.status === "active")) throw new ValidationError("Inclua ao menos um objetivo antes de ativar o plano.")
  return logged({ ...plan, status: "active" }, change(user, at, "Plano ativado", { status: { from: "draft", to: "active" } }))
}

export function closePlan(plan: AbaPlan, reason: string, user: User, at: string): AbaPlan {
  if (plan.status !== "active") throw new ValidationError("Somente planos ativos podem ser encerrados.")
  const clean = reason.trim()
  if (clean.length < 5) throw new ValidationError("Informe o motivo do encerramento (mínimo 5 caracteres).")
  return logged(
    { ...plan, status: "closed", closeReason: clean },
    change(user, at, "Plano encerrado", { status: { from: "active", to: "closed" } })
  )
}

/** RN-ABA-003 */
export function validateSession(
  plan: AbaPlan,
  input: { date: string; measures: AbaMeasure[] },
  today: string
) {
  if (plan.status !== "active") throw new ValidationError("Sessões só podem ser registradas em planos ativos.")
  if (input.date > today) throw new ValidationError("A data da sessão não pode ser futura.")
  if (!input.measures.length) throw new ValidationError("Registre ao menos uma medida.")
  const seen = new Set<string>()
  for (const m of input.measures) {
    const goal = plan.goals.find((g) => g.id === m.goalId)
    if (!goal || goal.status !== "active") throw new ValidationError("A medida referencia um objetivo inexistente ou inativo.")
    if (seen.has(m.goalId)) throw new ValidationError(`O objetivo "${goal.title}" aparece em mais de uma medida.`)
    seen.add(m.goalId)
    if (!Number.isInteger(m.trials) || m.trials < 1) throw new ValidationError("Cada medida precisa de ao menos 1 tentativa.")
    if (!Number.isInteger(m.correct) || m.correct < 0 || m.correct > m.trials) {
      throw new ValidationError(`Acertos de "${goal.title}" devem ficar entre 0 e o número de tentativas.`)
    }
  }
}

export function voidSession(session: AbaSession, reason: string, user: User, at: string): AbaSession {
  if (session.voidedAt) throw new ValidationError("Esta sessão já foi anulada.")
  const clean = reason.trim()
  if (clean.length < 5) throw new ValidationError("Informe o motivo da anulação (mínimo 5 caracteres).")
  return { ...session, voidedAt: at, voidedBy: user.id, voidReason: clean }
}

/** Registro no histórico do plano para fatos de sessão (sem medidas — RN-ABA-009). */
export function sessionLog(plan: AbaPlan, summary: string, user: User, at: string): AbaPlan {
  return logged(plan, change(user, at, summary))
}
