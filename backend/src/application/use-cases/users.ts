import { DomainError } from "@/application/errors"
import type { Actor } from "@/application/ports/patient-access"
import type {
  PasswordHasher,
  RoleRecord,
  UserAudit,
  UserMutation,
  UserPatch,
  UserRecord,
  UserRepository,
} from "@/application/ports/users"
import { assertAuthenticated, fieldsOf, isRecord } from "@/application/use-cases/clinical-payload"
import {
  ADMIN_ROLE,
  checkRolePermissions,
  PERMISSION_CATALOG,
  type PermissionDefinition,
} from "@/domain/permissions"

const MIN_NAME_LENGTH = 2
const MAX_NAME_LENGTH = 120
const MAX_EMAIL_LENGTH = 254
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const invalid = (detail: string) => new DomainError("validation", detail)

function nameOf(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : ""
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) throw invalid("Informe o nome do usuário.")
  return name
}

function emailOf(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!EMAIL.test(email) || email.length > MAX_EMAIL_LENGTH) throw invalid("Informe um e-mail válido.")
  return email
}

function passwordOf(value: unknown): string {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    throw invalid(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  }
  if (value.length > MAX_PASSWORD_LENGTH) throw invalid(`A senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`)
  return value
}

/** `null` and the empty string clear the link. */
function professionalIdOf(value: unknown): string | null {
  if (value === null || value === "") return null
  if (typeof value !== "string" || !UUID.test(value)) throw invalid("Profissional vinculado inválido.")
  return value
}

function activeOf(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalid("Situação do usuário inválida.")
  return value
}

const isActiveAdmin = (user: Pick<UserRecord, "active" | "roles">) => user.active && user.roles.includes(ADMIN_ROLE)

function changedFieldsOf(patch: UserPatch, roles?: string[]): string[] {
  const fields = Object.keys(patch).filter((field) => field !== "passwordHash")
  return roles ? [...fields, "roles"] : fields
}

export interface UserQueryInput { clinicId: string }
export interface GetUserInput { clinicId: string; id: string }
export interface CreateUserInput { clinicId: string; actor: Actor; body: unknown }
export interface ChangeUserInput { clinicId: string; actor: Actor; id: string; body: unknown }
export interface ChangeRolePermissionsInput { clinicId: string; actor: Actor; roleKey: string; body: unknown }

export interface PermissionGroup { group: string; permissions: PermissionDefinition[] }

/** The catalog grouped for the permission matrix, in catalog order. */
export function permissionGroups(): PermissionGroup[] {
  const groups = new Map<string, PermissionDefinition[]>()
  for (const permission of PERMISSION_CATALOG) {
    groups.set(permission.group, [...(groups.get(permission.group) ?? []), permission])
  }
  return [...groups].map(([group, permissions]) => ({ group, permissions }))
}

export function createUserQueries(repository: UserRepository) {
  return {
    listUsers: (query: UserQueryInput) => repository.list(query.clinicId),
    async getUser(query: GetUserInput): Promise<UserRecord> {
      const user = await repository.findById(query.clinicId, query.id)
      if (!user) throw new Error("not_found")
      return user
    },
    listRoles: (query: UserQueryInput) => repository.listRoles(query.clinicId),
    listPermissions: async () => permissionGroups(),
  }
}

export function createUserCommands(repository: UserRepository, hasher: PasswordHasher) {
  /** Every role must exist for the clinic and at least one is required. */
  async function rolesOf(clinicId: string, value: unknown): Promise<string[]> {
    if (!Array.isArray(value) || !value.length || value.some((role) => typeof role !== "string")) {
      throw invalid("Selecione ao menos um papel.")
    }
    const roles = [...new Set(value as string[])]
    const known = new Set(await repository.roleKeys(clinicId))
    if (roles.some((role) => !known.has(role))) throw invalid("Papel inexistente.")
    return roles
  }

  async function assertEmailFree(clinicId: string, email: string, exceptId?: string) {
    if (await repository.emailTaken(clinicId, email, exceptId)) {
      throw new DomainError("conflict", "Já existe um usuário com este e-mail.")
    }
  }

  /** The clinic always keeps one active administrator: the last one cannot be deactivated or lose the role. */
  function assertAdminKept(current: UserRecord, next: Pick<UserRecord, "active" | "roles">, activeAdmins: number) {
    if (isActiveAdmin(current) && !isActiveAdmin(next) && activeAdmins <= 1) {
      throw new DomainError("conflict", "A clínica precisa de ao menos um administrador ativo.")
    }
  }

  async function change<T>(
    input: { clinicId: string; actor: Actor; id: string },
    decide: (current: UserRecord, activeAdmins: number) => UserMutation<T>,
  ) {
    assertAuthenticated(input.actor)
    const changed = await repository.change({
      clinicId: input.clinicId,
      id: input.id,
      actorId: input.actor.userId,
      decide: (current, context) => decide(current, context.activeAdmins),
    })
    if (changed.outcome === "not_found") throw new Error("not_found")
    return changed
  }

  return {
    async createUser(command: CreateUserInput): Promise<UserRecord> {
      assertAuthenticated(command.actor)
      const body = fieldsOf(command.body)
      const name = nameOf(body.name)
      const email = emailOf(body.email)
      const password = passwordOf(body.password)
      const roles = await rolesOf(command.clinicId, body.roles)
      const professionalId = professionalIdOf(body.professionalId ?? null)
      const active = body.active === undefined ? true : activeOf(body.active)
      await assertEmailFree(command.clinicId, email)
      return repository.insert({
        clinicId: command.clinicId,
        actorId: command.actor.userId,
        user: { name, email, passwordHash: await hasher.hash(password), roles, professionalId, active },
        audit: { action: "create", resource: "user", summary: "Criou um usuário" },
      })
    },

    /** Name, e-mail, professional link, active flag and roles; fields not sent stay as they are. */
    async updateUser(command: ChangeUserInput): Promise<UserRecord> {
      if (!isRecord(command.body)) throw invalid("Dados inválidos.")
      const body = command.body
      const patch: UserPatch = {}
      if ("name" in body) patch.name = nameOf(body.name)
      if ("email" in body) patch.email = emailOf(body.email)
      if ("professionalId" in body) patch.professionalId = professionalIdOf(body.professionalId)
      if ("active" in body) patch.active = activeOf(body.active)
      const roles = "roles" in body ? await rolesOf(command.clinicId, body.roles) : undefined
      if (!Object.keys(patch).length && !roles) throw invalid("Nenhuma alteração informada.")
      if (patch.email) await assertEmailFree(command.clinicId, patch.email, command.id)
      const { record } = await change(command, (current, activeAdmins) => {
        assertAdminKept(current, { active: patch.active ?? current.active, roles: roles ?? current.roles }, activeAdmins)
        const onlyStatus = Object.keys(patch).length === 1 && patch.active !== undefined && !roles
        const audit: UserAudit = {
          action: onlyStatus ? "status_change" : "update",
          resource: "user",
          summary: onlyStatus ? (patch.active ? "Reativou um usuário" : "Desativou um usuário") : "Alterou um usuário",
          changedFields: changedFieldsOf(patch, roles),
        }
        return { patch, roles, revokeSessions: patch.active === false, audit, result: undefined }
      })
      return record
    },

    /** Replaces the user's whole role set. */
    async setUserRoles(command: ChangeUserInput): Promise<UserRecord> {
      const roles = await rolesOf(command.clinicId, fieldsOf(command.body).roles)
      const { record } = await change(command, (current, activeAdmins) => {
        assertAdminKept(current, { active: current.active, roles }, activeAdmins)
        return {
          roles,
          audit: { action: "update", resource: "user", summary: "Alterou os papéis de um usuário", changedFields: ["roles"] },
          result: undefined,
        }
      })
      return record
    },

    /** Ends the user's sessions: the new password is the only way back in. */
    async resetPassword(command: ChangeUserInput): Promise<UserRecord> {
      const password = passwordOf(fieldsOf(command.body).password)
      const passwordHash = await hasher.hash(password)
      const { record } = await change(command, () => ({
        patch: { passwordHash },
        revokeSessions: true,
        audit: { action: "password_reset", resource: "user", summary: "Redefiniu a senha de um usuário" },
        result: undefined,
      }))
      return record
    },

    /** Users are never deleted (the audit trail points at them): removing one deactivates it and ends its sessions. */
    async deactivateUser(command: Omit<ChangeUserInput, "body">): Promise<UserRecord> {
      const { record } = await change(command, (current, activeAdmins) => {
        assertAdminKept(current, { active: false, roles: current.roles }, activeAdmins)
        return {
          patch: { active: false },
          revokeSessions: true,
          audit: { action: "status_change", resource: "user", summary: "Desativou um usuário", changedFields: ["active"] },
          result: undefined,
        }
      })
      return record
    },

    async setRolePermissions(command: ChangeRolePermissionsInput): Promise<RoleRecord> {
      assertAuthenticated(command.actor)
      const requested = fieldsOf(command.body).permissions
      if (!Array.isArray(requested) || requested.some((key) => typeof key !== "string")) {
        throw invalid("Informe a lista de permissões do papel.")
      }
      const checked = checkRolePermissions(command.roleKey, requested as string[])
      if (!checked.ok) throw invalid(checked.reason)
      const result = await repository.setRolePermissions({
        clinicId: command.clinicId,
        roleKey: command.roleKey,
        actorId: command.actor.userId,
        permissions: checked.permissions,
        audit: {
          action: "update",
          resource: "role",
          summary: "Alterou as permissões de um papel",
          changedFields: ["permissions"],
        },
      })
      if (result.outcome === "not_found") throw new Error("not_found")
      return result.role
    },
  }
}

export function createUserUseCases(repository: UserRepository, hasher: PasswordHasher) {
  return { queries: createUserQueries(repository), commands: createUserCommands(repository, hasher) }
}

export type UserUseCases = ReturnType<typeof createUserUseCases>
