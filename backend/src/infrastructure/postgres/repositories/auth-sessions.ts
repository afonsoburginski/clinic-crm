import type { AuthSessionStore } from "@/application/ports/auth-sessions"
import { query } from "@/infrastructure/database"

/** 5 failures inside a 5-minute window lock the e-mail for 5 minutes (RN-AUTH-005). */
const RECORD_FAILURE_SQL =
  "INSERT INTO auth_login_lockouts(email_hash,failures,window_started_at,locked_until) VALUES($1,1,now(),NULL) ON CONFLICT(email_hash) DO UPDATE SET failures=CASE WHEN auth_login_lockouts.window_started_at<now()-interval '5 minutes' THEN 1 ELSE auth_login_lockouts.failures+1 END,window_started_at=CASE WHEN auth_login_lockouts.window_started_at<now()-interval '5 minutes' THEN now() ELSE auth_login_lockouts.window_started_at END,locked_until=CASE WHEN auth_login_lockouts.window_started_at<now()-interval '5 minutes' THEN NULL WHEN auth_login_lockouts.failures+1>=5 THEN now()+interval '5 minutes' ELSE NULL END"

export const postgresAuthSessions: AuthSessionStore = {
  async lockedUntil(emailHash) {
    const lock = await query<{ locked_until: Date | null }>(
      "SELECT locked_until,failures FROM auth_login_lockouts WHERE email_hash=$1",
      [emailHash],
    )
    const until = lock.rows[0]?.locked_until
    return until ? new Date(until) : null
  },
  async recordFailure(emailHash) {
    await query(RECORD_FAILURE_SQL, [emailHash])
  },
  async clearFailures(emailHash) {
    await query("DELETE FROM auth_login_lockouts WHERE email_hash=$1", [emailHash])
  },
  async create(tokenHash, userId, expiresAt) {
    await query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", [tokenHash, userId, expiresAt])
  },
  async activeUserId(tokenHash) {
    const r = await query<{ user_id: string }>(
      "SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
      [tokenHash],
    )
    return r.rows[0]?.user_id
  },
  async revoke(tokenHash) {
    await query("UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL", [tokenHash])
  },
}
