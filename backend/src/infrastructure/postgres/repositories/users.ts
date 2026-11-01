import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm"
import { DomainError } from "@/application/errors"
import type {
  ChangeUserCommand,
  ChangeUserResult,
  InsertUserCommand,
  ProvisionedUser,
  RoleRecord,
  SetRolePermissionsCommand,
  SetRolePermissionsResult,
  UserAudit,
  UserCredentials,
  UserDirectory,
  UserRecord,
  UserRepository,
} from "@/application/ports/users"
import { ADMIN_ROLE, allPermissions, PERMISSION_CATALOG, SYSTEM_ROLE_KEYS, SYSTEM_ROLES } from "@/domain/permissions"
import { db, type Database } from "@/infrastructure/postgres/drizzle"
import {
  auditEvents,
  authSessions,
  permissions,
  professionals as professionalsTable,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@/infrastructure/postgres/schema"

/** Both the database and an open transaction run these queries. */
export type Executor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MATRIX_TTL_MS = 15_000

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  active: users.active,
  professionalId: users.professionalId,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
}

// ------------------------------------------------------------------ queries (built, not run, so tests can read their SQL)

export const listUsersQuery = (executor: Executor, clinicId: string) =>
  executor.select(userColumns).from(users).where(eq(users.clinicId, clinicId)).orderBy(asc(sql`lower(${users.name})`))

export const userByIdQuery = (executor: Executor, clinicId: string, id: string) =>
  executor.select(userColumns).from(users).where(and(eq(users.clinicId, clinicId), eq(users.id, id))).limit(1)

export const credentialsByEmailQuery = (executor: Executor, clinicId: string, email: string) =>
  executor
    .select({ ...userColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.clinicId, clinicId), eq(sql`lower(${users.email})`, email.trim().toLowerCase())))
    .limit(1)

export const emailTakenQuery = (executor: Executor, clinicId: string, email: string, exceptId?: string) =>
  executor
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.clinicId, clinicId),
        eq(sql`lower(${users.email})`, email.trim().toLowerCase()),
        exceptId ? ne(users.id, exceptId) : undefined,
      ),
    )
    .limit(1)

export const userRolesQuery = (executor: Executor, clinicId: string, ids?: readonly string[]) =>
  executor
    .select({ userId: userRoles.userId, roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(and(eq(userRoles.clinicId, clinicId), ids ? inArray(userRoles.userId, [...ids]) : undefined))

/** Active users holding the administrator role (a user counts once). */
export const activeAdminCountQuery = (executor: Executor, clinicId: string) =>
  executor
    .select({ total: count() })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.clinicId, users.clinicId), eq(userRoles.userId, users.id)))
    .where(and(eq(users.clinicId, clinicId), eq(users.active, true), eq(userRoles.roleKey, ADMIN_ROLE)))

export const rolePermissionsQuery = (executor: Executor, clinicId: string) =>
  executor
    .select({ roleKey: rolePermissions.roleKey, permissionKey: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.clinicId, clinicId))

export const roleUserCountsQuery = (executor: Executor, clinicId: string) =>
  executor
    .select({ roleKey: userRoles.roleKey, total: count() })
    .from(userRoles)
    .where(eq(userRoles.clinicId, clinicId))
    .groupBy(userRoles.roleKey)

// ------------------------------------------------------------------ helpers

const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : String(value))

type UserRow = {
  id: string
  name: string
  email: string
  active: boolean
  professionalId: string | null
  createdAt: Date
  updatedAt: Date
}

function toUserRecord(row: UserRow, roleKeys: readonly string[]): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    active: row.active,
    roles: [...roleKeys],
    professionalId: row.professionalId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

function rolesByUser(rows: readonly { userId: string; roleKey: string }[]) {
  const byUser = new Map<string, string[]>()
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.roleKey])
  return byUser
}

async function loadUser(executor: Executor, clinicId: string, id: string): Promise<UserRecord | undefined> {
  const [row] = await userByIdQuery(executor, clinicId, id)
  if (!row) return undefined
  const keys = await userRolesQuery(executor, clinicId, [id])
  return toUserRecord(row, keys.map((role) => role.roleKey))
}

/** One lock per clinic serializes the writes whose rules look at other users (the last administrator). */
const lockClinicUsers = (executor: Executor, clinicId: string) =>
  executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`users:${clinicId}`}))`)

const pgCodeOf = (error: unknown): string | undefined => {
  const source = error as { code?: unknown; cause?: { code?: unknown } } | null
  const code = source?.code ?? source?.cause?.code
  return typeof code === "string" ? code : undefined
}

/** Maps the constraint a write tripped over to the domain error the API answers with. */
function translateWriteError(error: unknown): never {
  const code = pgCodeOf(error)
  if (code === "23505") throw new DomainError("conflict", "Já existe um usuário com este e-mail.")
  if (code === "23503") throw new DomainError("validation", "Profissional ou papel não encontrado.")
  throw error
}

function recordAudit(executor: Executor, clinicId: string, actorId: string, resourceId: string, audit: UserAudit) {
  const changes = audit.changedFields?.length
    ? audit.changedFields.map((field) => ({ field, from: null, to: null }))
    : null
  return executor.insert(auditEvents).values({
    clinicId,
    actorId,
    action: audit.action,
    resource: audit.resource,
    resourceId,
    summary: audit.summary,
    changes,
  })
}

// ------------------------------------------------------------------ role matrix

async function loadMatrix(executor: Executor, clinicId: string): Promise<Map<string, string[]>> {
  const matrix = new Map<string, string[]>()
  for (const row of await rolePermissionsQuery(executor, clinicId)) {
    matrix.set(row.roleKey, [...(matrix.get(row.roleKey) ?? []), row.permissionKey])
  }
  return matrix
}

// ------------------------------------------------------------------ repository

function sortRoles(list: RoleRecord[]) {
  const rank = (key: string) => {
    const index = SYSTEM_ROLE_KEYS.indexOf(key)
    return index === -1 ? SYSTEM_ROLE_KEYS.length : index
  }
  return list.sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label, "pt-BR"))
}

async function loadRoles(executor: Executor, clinicId: string): Promise<RoleRecord[]> {
  const [roleRows, matrix, counts] = await Promise.all([
    executor.select().from(roles).where(eq(roles.clinicId, clinicId)),
    loadMatrix(executor, clinicId),
    roleUserCountsQuery(executor, clinicId),
  ])
  const totals = new Map(counts.map((row) => [row.roleKey, Number(row.total)]))
  return sortRoles(
    roleRows.map((role) => ({
      key: role.key,
      label: role.label,
      description: role.description,
      isSystem: role.isSystem,
      permissions: [...(matrix.get(role.key) ?? [])].sort(),
      userCount: totals.get(role.key) ?? 0,
    })),
  )
}

// ------------------------------------------------------------------ directory (authentication and the guard)

async function seedDefaults(executor: Executor, clinicId: string) {
  await executor
    .insert(permissions)
    .values(PERMISSION_CATALOG.map((p) => ({ key: p.key, label: p.label, groupLabel: p.group })))
    .onConflictDoUpdate({
      target: permissions.key,
      set: { label: sql`excluded.label`, groupLabel: sql`excluded.group_label` },
    })
  const created = await executor
    .insert(roles)
    .values(
      SYSTEM_ROLES.map((role) => ({
        clinicId,
        key: role.key,
        label: role.label,
        description: role.description,
        isSystem: true,
      })),
    )
    .onConflictDoNothing()
    .returning({ key: roles.key })
  // Only roles created now get the default matrix: a matrix edited by the clinic is never overwritten.
  const grants = created.flatMap(({ key }) =>
    (SYSTEM_ROLES.find((role) => role.key === key)?.permissions ?? []).map((permissionKey) => ({
      clinicId,
      roleKey: key,
      permissionKey,
    })),
  )
  if (grants.length) await executor.insert(rolePermissions).values(grants).onConflictDoNothing()
  // The administrator is immutable and always holds the whole catalog, so a permission added later is granted here.
  await executor
    .insert(rolePermissions)
    .values(allPermissions().map((permissionKey) => ({ clinicId, roleKey: ADMIN_ROLE, permissionKey })))
    .onConflictDoNothing()
}

async function importProvisioned(executor: Executor, clinicId: string, provisioned: readonly ProvisionedUser[]) {
  const [existing] = await executor.select({ total: count() }).from(users).where(eq(users.clinicId, clinicId))
  if (Number(existing.total) > 0 || !provisioned.length) return
  const linked = provisioned.flatMap((user) =>
    user.professionalId && UUID.test(user.professionalId) ? [user.professionalId] : [],
  )
  const professionalIds = new Set(
    linked.length
      ? (
          await executor
            .select({ id: professionalsTable.id })
            .from(professionalsTable)
            .where(and(eq(professionalsTable.clinicId, clinicId), inArray(professionalsTable.id, linked)))
        ).map((row) => row.id)
      : [],
  )
  for (const user of provisioned) {
    const created = await executor
      .insert(users)
      .values({
        clinicId,
        ...(UUID.test(user.id) ? { id: user.id } : {}),
        name: user.name,
        email: user.email.trim().toLowerCase(),
        passwordHash: user.passwordHash,
        professionalId: user.professionalId && professionalIds.has(user.professionalId) ? user.professionalId : null,
        active: true,
      })
      .onConflictDoNothing()
      .returning({ id: users.id })
    if (created[0]) {
      await executor
        .insert(userRoles)
        .values(user.roles.map((roleKey) => ({ clinicId, userId: created[0].id, roleKey })))
        .onConflictDoNothing()
    }
  }
}

/**
 * The repository (user management) and the directory (authentication, guard) share the short-lived cache of the
 * role matrix, so saving a role's permissions is seen at once by this process; other instances see it within the TTL.
 */
export function createPostgresUsers(database: () => Database) {
  const matrixCache = new Map<string, { at: number; matrix: Map<string, string[]> }>()

  const repository: UserRepository = {
    async list(clinicId) {
      const executor = database()
      const [rows, keys] = await Promise.all([listUsersQuery(executor, clinicId), userRolesQuery(executor, clinicId)])
      const byUser = rolesByUser(keys)
      return rows.map((row) => toUserRecord(row, byUser.get(row.id) ?? []))
    },
    findById: (clinicId, id) => loadUser(database(), clinicId, id),
    async emailTaken(clinicId, email, exceptId) {
      return (await emailTakenQuery(database(), clinicId, email, exceptId)).length > 0
    },
    async roleKeys(clinicId) {
      return (await database().select({ key: roles.key }).from(roles).where(eq(roles.clinicId, clinicId))).map((r) => r.key)
    },
    listRoles: (clinicId) => loadRoles(database(), clinicId),

    async insert(command: InsertUserCommand) {
      try {
        return await database().transaction(async (tx) => {
          const { clinicId, actorId, user, audit } = command
          const [created] = await tx
            .insert(users)
            .values({
              clinicId,
              name: user.name,
              email: user.email,
              passwordHash: user.passwordHash,
              professionalId: user.professionalId,
              active: user.active,
            })
            .returning({ id: users.id })
          await tx.insert(userRoles).values(user.roles.map((roleKey) => ({ clinicId, userId: created.id, roleKey })))
          await recordAudit(tx, clinicId, actorId, created.id, audit)
          return (await loadUser(tx, clinicId, created.id))!
        })
      } catch (error) {
        return translateWriteError(error)
      }
    },

    async change<T>(command: ChangeUserCommand<T>): Promise<ChangeUserResult<T>> {
      const { clinicId, id, actorId, decide } = command
      try {
        return await database().transaction(async (tx) => {
          await lockClinicUsers(tx, clinicId)
          const current = await loadUser(tx, clinicId, id)
          if (!current) return { outcome: "not_found" as const }
          const [{ total }] = await activeAdminCountQuery(tx, clinicId)
          const mutation = decide(current, { activeAdmins: Number(total) })
          if (mutation.patch || mutation.roles) {
            await tx
              .update(users)
              .set({ ...mutation.patch, updatedAt: sql`now()` })
              .where(and(eq(users.clinicId, clinicId), eq(users.id, id)))
          }
          if (mutation.roles) {
            await tx.delete(userRoles).where(and(eq(userRoles.clinicId, clinicId), eq(userRoles.userId, id)))
            await tx.insert(userRoles).values(mutation.roles.map((roleKey) => ({ clinicId, userId: id, roleKey })))
          }
          if (mutation.revokeSessions) {
            await tx
              .update(authSessions)
              .set({ revokedAt: sql`now()` })
              .where(and(eq(authSessions.userId, id), isNull(authSessions.revokedAt)))
          }
          await recordAudit(tx, clinicId, actorId, id, mutation.audit)
          return { outcome: "done" as const, record: (await loadUser(tx, clinicId, id))!, result: mutation.result }
        })
      } catch (error) {
        return translateWriteError(error)
      }
    },

    async setRolePermissions(command: SetRolePermissionsCommand): Promise<SetRolePermissionsResult> {
      const { clinicId, roleKey, actorId, permissions: next, audit } = command
      const result = await database().transaction(async (tx) => {
        await lockClinicUsers(tx, clinicId)
        const [role] = await tx
          .select({ key: roles.key })
          .from(roles)
          .where(and(eq(roles.clinicId, clinicId), eq(roles.key, roleKey)))
        if (!role) return { outcome: "not_found" as const }
        await tx
          .delete(rolePermissions)
          .where(and(eq(rolePermissions.clinicId, clinicId), eq(rolePermissions.roleKey, roleKey)))
        if (next.length) {
          await tx.insert(rolePermissions).values(next.map((permissionKey) => ({ clinicId, roleKey, permissionKey })))
        }
        await recordAudit(tx, clinicId, actorId, roleKey, audit)
        const updated = (await loadRoles(tx, clinicId)).find((candidate) => candidate.key === roleKey)!
        return { outcome: "done" as const, role: updated }
      })
      matrixCache.delete(clinicId)
      return result
    },
  }

  const directory: UserDirectory = {
    async ensureReady(clinicId, provisioned) {
      await database().transaction(async (tx) => {
        await lockClinicUsers(tx, clinicId)
        await seedDefaults(tx, clinicId)
        await importProvisioned(tx, clinicId, provisioned)
      })
      matrixCache.delete(clinicId)
    },
    async findCredentials(clinicId, email) {
      const executor = database()
      const [row] = await credentialsByEmailQuery(executor, clinicId, email)
      if (!row) return undefined
      const keys = await userRolesQuery(executor, clinicId, [row.id])
      const { passwordHash, ...rest } = row
      const credentials: UserCredentials = { ...toUserRecord(rest, keys.map((role) => role.roleKey)), passwordHash }
      return credentials
    },
    findById: (clinicId, id) => loadUser(database(), clinicId, id),
    async rolePermissions(clinicId) {
      const cached = matrixCache.get(clinicId)
      if (cached && Date.now() - cached.at < MATRIX_TTL_MS) return cached.matrix
      const matrix = await loadMatrix(database(), clinicId)
      matrixCache.set(clinicId, { at: Date.now(), matrix })
      return matrix
    },
  }

  return { repository, directory, clearCache: () => matrixCache.clear() }
}

const postgres = createPostgresUsers(db)
export const postgresUserRepository = postgres.repository
export const postgresUserDirectory = postgres.directory
