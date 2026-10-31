import type {
  ChangeUserCommand,
  ChangeUserResult,
  InsertUserCommand,
  RoleRecord,
  SetRolePermissionsCommand,
  SetRolePermissionsResult,
  UserAudit,
  UserRecord,
  UserRepository,
} from "@/application/ports/users"
import { SYSTEM_ROLES } from "@/domain/permissions"

export class FakeUserRepository implements UserRepository {
  users: UserRecord[] = []
  hashes = new Map<string, string>()
  roles: RoleRecord[] = SYSTEM_ROLES.map((role) => ({
    key: role.key,
    label: role.label,
    description: role.description,
    isSystem: true,
    permissions: [...role.permissions],
    userCount: 0,
  }))
  audits: UserAudit[] = []
  revoked: string[] = []
  private next = 1

  async list() {
    return this.users
  }
  async findById(_clinicId: string, id: string) {
    return this.users.find((user) => user.id === id)
  }
  async emailTaken(_clinicId: string, email: string, exceptId?: string) {
    return this.users.some((user) => user.email.toLowerCase() === email.toLowerCase() && user.id !== exceptId)
  }
  async roleKeys() {
    return this.roles.map((role) => role.key)
  }
  async listRoles() {
    return this.roles.map((role) => ({
      ...role,
      userCount: this.users.filter((user) => user.roles.includes(role.key)).length,
    }))
  }
  async insert(command: InsertUserCommand): Promise<UserRecord> {
    const at = new Date().toISOString()
    const { passwordHash, ...rest } = command.user
    const user: UserRecord = { id: `user-${this.next++}`, ...rest, createdAt: at, updatedAt: at }
    this.users.push(user)
    this.hashes.set(user.id, passwordHash)
    this.audits.push(command.audit)
    return user
  }
  async change<T>(command: ChangeUserCommand<T>): Promise<ChangeUserResult<T>> {
    const current = this.users.find((user) => user.id === command.id)
    if (!current) return { outcome: "not_found" }
    const activeAdmins = this.users.filter((user) => user.active && user.roles.includes("admin")).length
    const mutation = command.decide(current, { activeAdmins })
    const { passwordHash, ...patch } = mutation.patch ?? {}
    if (passwordHash) this.hashes.set(current.id, passwordHash)
    const record: UserRecord = { ...current, ...patch, roles: mutation.roles ?? current.roles }
    this.users = this.users.map((user) => (user.id === current.id ? record : user))
    if (mutation.revokeSessions) this.revoked.push(current.id)
    this.audits.push(mutation.audit)
    return { outcome: "done", record, result: mutation.result }
  }
  async setRolePermissions(command: SetRolePermissionsCommand): Promise<SetRolePermissionsResult> {
    const role = this.roles.find((candidate) => candidate.key === command.roleKey)
    if (!role) return { outcome: "not_found" }
    role.permissions = [...command.permissions]
    this.audits.push(command.audit)
    return { outcome: "done", role }
  }
}
