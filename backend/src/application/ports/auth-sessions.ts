/** Persistence of login attempts and sessions; tokens and e-mails are only ever stored hashed. */
export interface AuthSessionStore {
  lockedUntil(emailHash: string): Promise<Date | null>
  recordFailure(emailHash: string): Promise<void>
  clearFailures(emailHash: string): Promise<void>
  create(tokenHash: string, userId: string, expiresAt: Date): Promise<void>
  /** The user of a session that is neither revoked nor expired. */
  activeUserId(tokenHash: string): Promise<string | undefined>
  revoke(tokenHash: string): Promise<void>
}
