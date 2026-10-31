import { describe, expect, it } from "vitest"

import {
  EMPTY_ATTEMPTS,
  LOCKOUT_MS,
  MAX_LOGIN_ATTEMPTS,
  isLocked,
  registerFailure,
  remainingLockMinutes,
} from "../login-lockout"

describe("login lockout (RN-AUTH-005)", () => {
  it("CA-AUTH-004: bloqueia após o limite de falhas", () => {
    let state = EMPTY_ATTEMPTS
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) state = registerFailure(state, 0)
    expect(isLocked(state, 0)).toBe(false)
    state = registerFailure(state, 0)
    expect(isLocked(state, 1000)).toBe(true)
    expect(remainingLockMinutes(state, 0)).toBe(5)
  })

  it("libera após o tempo de bloqueio e recomeça a contagem", () => {
    let state = EMPTY_ATTEMPTS
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) state = registerFailure(state, 0)
    expect(isLocked(state, LOCKOUT_MS + 1)).toBe(false)
    state = registerFailure(state, LOCKOUT_MS + 1)
    expect(state).toEqual({ failures: 1, lockedUntil: null })
  })
})
