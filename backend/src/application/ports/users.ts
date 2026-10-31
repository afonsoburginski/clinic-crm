/** A user as the management API shows it: never carries the password hash. */
export interface UserRecord {
  id: string
  name: string
  email: string
  active: boolean
  roles: string[]
  professionalId: string | null
  createdAt: string
  updatedAt: string
}

/** What authentication needs to check a password. */
export interface UserCredentials extends UserRecord {
  passwordHash: string
}

export interface RoleRecord {
  key: string
  label: string
  description: string
  isSystem: boolean
  permissions: string[]
  userCount: number
}

/** `changedFields` only names the fields: values, passwords and hashes never reach the audit trail. */
export interface UserAudit {
  action: "create" | "update" | "status_change" | "password_reset"
  resource: "user" | "role"
  summary: string
  changedFields?: readonly string[]
}

export interface NewUser {
  name: string
  email: string
  passwordHash: string
  roles: string[]
  professionalId: string | null
  active: boolean
}

export interface InsertUserCommand {
  clinicId: string
  actorId: string
  user: NewUser
  audit: UserAudit
}

/** Fields a change may write; `passwordHash` is only ever set by a password reset. */
export interface UserPatch {
  name?: string
  email?: string
  professionalId?: string | null
  active?: boolean
  passwordHash?: string
}

/**
 * What a change decided, under the clinic's user lock: the fields and roles to write, whether the user's
 * sessions end, the audit entry, and the value handed back to the caller.
 */
export interface UserMutation<T> {
  patch?: UserPatch
  roles?: string[]
  revokeSessions?: boolean
  audit: UserAudit
  result: T
}

/** Facts the rules need that only the store knows, read under the same lock as the write. */
export interface UserChangeContext {
  /** Active users holding the administrator role, including the one being changed. */
  activeAdmins: number
}

export type UserChange<T> = (current: UserRecord, context: UserChangeContext) => UserMutation<T>

export interface ChangeUserCommand<T> {
  clinicId: string
  id: string
  actorId: string
  decide: UserChange<T>
}

export type ChangeUserResult<T> = { outcome: "done"; record: UserRecord; result: T } | { outcome: "not_found" }

export interface SetRolePermissionsCommand {
  clinicId: string
  roleKey: string
  actorId: string
  permissions: string[]
  audit: UserAudit
}

export type SetRolePermissionsResult = { outcome: "done"; role: RoleRecord } | { outcome: "not_found" }

export interface UserQueryRepository {
  list(clinicId: string): Promise<UserRecord[]>
  findById(clinicId: string, id: string): Promise<UserRecord | undefined>
  emailTaken(clinicId: string, email: string, exceptId?: string): Promise<boolean>
  roleKeys(clinicId: string): Promise<string[]>
  listRoles(clinicId: string): Promise<RoleRecord[]>
}

export interface UserCommandRepository {
  insert(command: InsertUserCommand): Promise<UserRecord>
  change<T>(command: ChangeUserCommand<T>): Promise<ChangeUserResult<T>>
  setRolePermissions(command: SetRolePermissionsCommand): Promise<SetRolePermissionsResult>
}

export interface UserRepository extends UserQueryRepository, UserCommandRepository {}

/** A user listed in `AUTH_USERS_JSON`, imported once when the clinic has no users yet. */
export interface ProvisionedUser {
  id: string
  name: string
  email: string
  passwordHash: string
  roles: string[]
  professionalId?: string
}

/** Reads used by authentication and by the permission guard. */
export interface UserDirectory {
  /** Seeds the default roles and permissions the first time the clinic is used; imports the provisioned users into an empty clinic. */
  ensureReady(clinicId: string, provisioned: readonly ProvisionedUser[]): Promise<void>
  findCredentials(clinicId: string, email: string): Promise<UserCredentials | undefined>
  findById(clinicId: string, id: string): Promise<UserRecord | undefined>
  /** Persisted role → permissions matrix (briefly cached). */
  rolePermissions(clinicId: string): Promise<Map<string, string[]>>
}

export interface PasswordHasher {
  hash(password: string): Promise<string>
}
