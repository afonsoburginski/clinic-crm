export const MAX_LOGIN_ATTEMPTS = 5
export const LOCKOUT_MS = 5 * 60 * 1000

export interface LoginAttemptState {
  failures: number
  lockedUntil: number | null
}

export const EMPTY_ATTEMPTS: LoginAttemptState = { failures: 0, lockedUntil: null }

export function isLocked(state: LoginAttemptState, now: number) {
  return state.lockedUntil !== null && state.lockedUntil > now
}

export function remainingLockMinutes(state: LoginAttemptState, now: number) {
  if (!isLocked(state, now)) return 0
  return Math.ceil(((state.lockedUntil as number) - now) / 60000)
}

/** RN-AUTH-005: após MAX_LOGIN_ATTEMPTS falhas seguidas, bloqueia por LOCKOUT_MS. */
export function registerFailure(state: LoginAttemptState, now: number): LoginAttemptState {
  const base = state.lockedUntil !== null && state.lockedUntil <= now ? EMPTY_ATTEMPTS : state
  const failures = base.failures + 1
  return failures >= MAX_LOGIN_ATTEMPTS
    ? { failures: 0, lockedUntil: now + LOCKOUT_MS }
    : { failures, lockedUntil: null }
}
