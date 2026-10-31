import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { DomainError } from "@/application/errors"
import type { UserRepository, UserDirectory } from "@/application/ports/users"
import { SYSTEM_ROLES } from "@/domain/permissions"
import { createPostgresUsers } from "@/infrastructure/postgres/repositories/users"
import * as schema from "@/infrastructure/postgres/schema"

/**
 * Runs against a real PostgreSQL that already has migrations 001–006 applied, e.g.
 * `TEST_DATABASE_URL=postgres://… bun test test/users-repository.test.ts`. Skipped without it.
 */
const url = Bun.env.TEST_DATABASE_URL

describe.skipIf(!url)("postgres users repository (needs TEST_DATABASE_URL)", () => {
  const clinicIds: string[] = []
  const newClinic = () => {
    const id = crypto.randomUUID()
    clinicIds.push(id)
    return id
  }
  let pool: Pool
  let repository: UserRepository
  let directory: UserDirectory

  beforeAll(() => {
    pool = new Pool({ connectionString: url })
    const postgres = createPostgresUsers(() => drizzle(pool, { schema }))
    repository = postgres.repository
    directory = postgres.directory
  })

  afterAll(async () => {
    for (const clinicId of clinicIds) {
      for (const table of ["user_roles", "role_permissions", "users", "roles", "audit_events"]) {
        await pool.query(`DELETE FROM ${table} WHERE clinic_id = $1`, [clinicId])
      }
    }
    await pool.end()
  })

  const audit = { action: "create", resource: "user", summary: "Criou um usuário" } as const
  const user = (email: string, roles = ["reception"]) => ({
    name: "Ana Souza", email, passwordHash: "hash", roles, professionalId: null, active: true,
  })

  test("seeds the default roles once and never overwrites an edited matrix", async () => {
    const clinicId = newClinic()
    await directory.ensureReady(clinicId, [])
    const first = await repository.listRoles(clinicId)
    expect(first.map((role) => role.key)).toEqual(SYSTEM_ROLES.map((role) => role.key))
    await repository.setRolePermissions({
      clinicId, roleKey: "reception", actorId: "actor", permissions: ["dashboard:read"], audit: { ...audit, action: "update", resource: "role" },
    })
    await directory.ensureReady(clinicId, [])
    expect((await directory.rolePermissions(clinicId)).get("reception")).toEqual(["dashboard:read"])
  })

  test("imports the provisioned users into an empty clinic only", async () => {
    const clinicId = newClinic()
    const provisioned = [{ id: "u1", name: "Admin", email: "Admin@Clinica.com", passwordHash: "bcrypt-hash", roles: ["admin"] }]
    await directory.ensureReady(clinicId, provisioned)
    await directory.ensureReady(clinicId, [{ ...provisioned[0], email: "other@clinica.com" }])
    const all = await repository.list(clinicId)
    expect(all).toHaveLength(1)
    const found = await directory.findCredentials(clinicId, "admin@clinica.com")
    expect(found).toMatchObject({ roles: ["admin"], passwordHash: "bcrypt-hash", active: true })
  })

  test("inserts, finds case-insensitively and refuses a duplicate e-mail with a conflict", async () => {
    const clinicId = newClinic()
    await directory.ensureReady(clinicId, [])
    const created = await repository.insert({ clinicId, actorId: "actor", user: user("ana@clinica.com"), audit })
    expect(await repository.emailTaken(clinicId, "ANA@clinica.com")).toBe(true)
    expect(await repository.emailTaken(clinicId, "ana@clinica.com", created.id)).toBe(false)
    expect((await directory.findCredentials(clinicId, "Ana@Clinica.com"))?.id).toBe(created.id)
    const error = await repository.insert({ clinicId, actorId: "actor", user: user("ANA@clinica.com"), audit }).catch((e) => e)
    expect(error).toBeInstanceOf(DomainError)
    expect(error.message).toBe("conflict")
  })

  test("two concurrent deactivations never leave the clinic without an administrator", async () => {
    const clinicId = newClinic()
    await directory.ensureReady(clinicId, [])
    const a = await repository.insert({ clinicId, actorId: "actor", user: user("a@clinica.com", ["admin"]), audit })
    const b = await repository.insert({ clinicId, actorId: "actor", user: user("b@clinica.com", ["admin"]), audit })
    const deactivate = (id: string) =>
      repository.change({
        clinicId, id, actorId: "actor",
        decide: (current, { activeAdmins }) => {
          if (current.active && activeAdmins <= 1) throw new DomainError("conflict", "último administrador")
          return { patch: { active: false }, revokeSessions: true, audit: { ...audit, action: "status_change" }, result: undefined }
        },
      })
    const results = await Promise.allSettled([deactivate(a.id), deactivate(b.id)])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1)
    expect((await repository.list(clinicId)).filter((u) => u.active)).toHaveLength(1)
  })

  test("a role matrix edit is visible to the directory at once, and replacing roles is atomic", async () => {
    const clinicId = newClinic()
    await directory.ensureReady(clinicId, [])
    const created = await repository.insert({ clinicId, actorId: "actor", user: user("c@clinica.com"), audit })
    await repository.setRolePermissions({
      clinicId, roleKey: "finance", actorId: "actor", permissions: ["finance:read"], audit: { ...audit, action: "update", resource: "role" },
    })
    expect((await directory.rolePermissions(clinicId)).get("finance")).toEqual(["finance:read"])
    const changed = await repository.change({
      clinicId, id: created.id, actorId: "actor",
      decide: () => ({ roles: ["finance", "manager"], audit: { ...audit, action: "update" }, result: undefined }),
    })
    expect(changed.outcome === "done" && changed.record.roles.sort()).toEqual(["finance", "manager"])
    expect((await repository.listRoles(clinicId)).find((role) => role.key === "finance")?.userCount).toBe(1)
  })

  test("revoking sessions ends the user's sessions", async () => {
    const clinicId = newClinic()
    await directory.ensureReady(clinicId, [])
    const created = await repository.insert({ clinicId, actorId: "actor", user: user("d@clinica.com"), audit })
    const tokenHash = `test-${crypto.randomUUID()}`
    await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [tokenHash, created.id])
    await repository.change({
      clinicId, id: created.id, actorId: "actor",
      decide: () => ({ patch: { active: false }, revokeSessions: true, audit: { ...audit, action: "status_change" }, result: undefined }),
    })
    const row = await pool.query("SELECT revoked_at FROM auth_sessions WHERE token_hash=$1", [tokenHash])
    expect(row.rows[0].revoked_at).not.toBeNull()
    await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1", [tokenHash])
  })
})
