/** Authenticated caller as the application layer sees it. */
export interface Actor {
  userId: string
  roles: readonly string[]
  /** Effective permissions resolved by the session; absent for internal callers. */
  permissions?: readonly string[]
  professionalId?: string
}

/** Restricts clinical data to the professionals linked to the patient. Rejects with `forbidden`. */
export interface PatientAccessPolicy {
  assertAccess(patientId: string | undefined, actor: Actor): Promise<void>
}
