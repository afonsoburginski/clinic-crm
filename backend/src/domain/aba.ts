export type AbaFields = Record<string, unknown>

function isFields(value: unknown): value is AbaFields {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function recordedAt(session: AbaFields): string {
  return String(session.date ?? session.createdAt ?? "")
}

/** Sessions that count towards a plan: not voided, unplanned or linked to it. Newest first. */
export function plannedSessions(sessions: readonly AbaFields[], planId: unknown): AbaFields[] {
  return sessions
    .filter((session) => !session.voided && (!session.planId || session.planId === planId))
    .sort((a, b) => recordedAt(b).localeCompare(recordedAt(a)))
}

/** Valid percentages measured for a goal, in the order of the sessions given. */
export function goalPercents(goalId: unknown, sessions: readonly AbaFields[]): number[] {
  return sessions.flatMap((session) =>
    listOf(session.measures).flatMap((measure) =>
      isFields(measure) &&
      measure.goalId === goalId &&
      measure.voided !== true &&
      typeof measure.percent === "number" &&
      Number.isFinite(measure.percent)
        ? [measure.percent]
        : [],
    ),
  )
}

function requiredSessions(value: unknown): number {
  if (typeof value === "number") return value
  return value === undefined || value === null ? 1 : Number.NaN
}

/** A goal is completed when its newest `consecutiveSessions` measures all reach `targetPercent`. */
export function isGoalCompleted(goal: AbaFields, percents: readonly number[]): boolean {
  const required = requiredSessions(goal.consecutiveSessions)
  const target = typeof goal.targetPercent === "number" ? goal.targetPercent : Number.NaN
  const recent = percents.slice(0, required)
  return recent.length === required && recent.every((percent) => percent >= target)
}

/** `percents` are newest first: progress is the latest measure, rounded. */
export function goalWithProgress(goal: AbaFields, percents: readonly number[]): AbaFields {
  return {
    ...goal,
    progress: percents.length ? Math.round(percents[0]) : 0,
    status: isGoalCompleted(goal, percents) ? "completed" : goal.status,
  }
}

export function goalsWithProgress(
  goals: readonly unknown[],
  sessions: readonly AbaFields[],
  planId: unknown,
): AbaFields[] {
  const counted = plannedSessions(sessions, planId)
  return goals.filter(isFields).map((goal) => goalWithProgress(goal, goalPercents(goal.id, counted)))
}
