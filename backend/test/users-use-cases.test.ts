import { beforeEach, describe, expect, test } from "bun:test"
import { DomainError } from "@/application/errors"
import { createUserUseCases } from "@/application/use-cases/users"
import { FakeUserRepository } from "./fakes/users-repository"

const CLINIC = "clinic"
const actor = { userId: "actor-1", roles: ["admin"] }
const PROFESSIONAL = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"
const hasher = { hash: async (password: string) => `hashed:${password}` }

let repository: FakeUserRepository
let useCases: ReturnType<typeof createUserUseCases>

beforeEach(() => {
  repository = new FakeUserRepository()
  useCases = createUserUseCases(repository, hasher)
})

const create = (body: Record<string, unknown> = {}) =>
  useCases.commands.createUser({
    clinicId: CLINIC,
    actor,
    body: { name: "Ana Souza", email: "Ana@Clinica.com", password: "senha-forte", roles: ["reception"], ...body },
  })

async function failure(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error("expected a failure")
}

describe("createUser", () => {
  test("stores a hashed password, a lowercase e-mail and audits the creation without secrets", async () => {
    const user = await create()
    expect(user).toMatchObject({ name: "Ana Souza", email: "ana@clinica.com", roles: ["reception"], active: true, professionalId: null })
    expect(repository.hashes.get(user.id)).toBe("hashed:senha-forte")
    expect(JSON.stringify(user)).not.toContain("hashed")
    expect(repository.audits).toEqual([{ action: "create", resource: "user", summary: "Criou um usuário" }])
  })

  test("refuses a short password", async () => {
    const error = await failure(create({ password: "curta" }))
    expect(error.message).toBe("validation")
    expect((error as DomainError).detail).toContain("8 caracteres")
    expect(repository.users).toEqual([])
  })

  test("refuses an invalid e-mail and a missing name", async () => {
    expect((await failure(create({ email: "sem-arroba" }))).message).toBe("validation")
    expect((await failure(create({ name: " " }))).message).toBe("validation")
  })

  test("refuses a duplicate e-mail regardless of case", async () => {
    await create()
    const error = await failure(create({ email: "ANA@clinica.com" }))
    expect(error.message).toBe("conflict")
    expect((error as DomainError).detail).toBe("Já existe um usuário com este e-mail.")
  })

  test("refuses an unknown role and an empty role list", async () => {
    expect((await failure(create({ roles: ["superuser"] }))).message).toBe("validation")
    expect((await failure(create({ roles: [] }))).message).toBe("validation")
    expect((await failure(create({ roles: "admin" }))).message).toBe("validation")
  })

  test("accepts a professional link only as a uuid", async () => {
    expect((await create({ professionalId: PROFESSIONAL })).professionalId).toBe(PROFESSIONAL)
    expect((await failure(create({ email: "b@x.com", professionalId: "p1" }))).message).toBe("validation")
  })

  test("refuses the internal system actor", async () => {
    const error = await failure(
      useCases.commands.createUser({ clinicId: CLINIC, actor: { userId: "system", roles: [] }, body: {} }),
    )
    expect(error.message).toBe("unauthorized")
  })
})

describe("updateUser", () => {
  test("changes only the fields sent and audits their names, never their values", async () => {
    const user = await create()
    const updated = await useCases.commands.updateUser({
      clinicId: CLINIC, actor, id: user.id, body: { name: "Ana Maria", professionalId: PROFESSIONAL },
    })
    expect(updated).toMatchObject({ name: "Ana Maria", email: "ana@clinica.com", professionalId: PROFESSIONAL })
    expect(repository.audits.at(-1)).toEqual({
      action: "update", resource: "user", summary: "Alterou um usuário", changedFields: ["name", "professionalId"],
    })
  })

  test("a status-only change is audited as a status change and ends the sessions when deactivating", async () => {
    const user = await create()
    await useCases.commands.updateUser({ clinicId: CLINIC, actor, id: user.id, body: { active: false } })
    expect(repository.audits.at(-1)).toMatchObject({ action: "status_change", summary: "Desativou um usuário" })
    expect(repository.revoked).toEqual([user.id])
    await useCases.commands.updateUser({ clinicId: CLINIC, actor, id: user.id, body: { active: true } })
    expect(repository.audits.at(-1)).toMatchObject({ summary: "Reativou um usuário" })
    expect(repository.revoked).toEqual([user.id])
  })

  test("refuses an e-mail another user already has, but not the user's own", async () => {
    const ana = await create()
    await create({ email: "bia@clinica.com" })
    expect((await failure(useCases.commands.updateUser({ clinicId: CLINIC, actor, id: ana.id, body: { email: "bia@clinica.com" } }))).message).toBe("conflict")
    expect((await useCases.commands.updateUser({ clinicId: CLINIC, actor, id: ana.id, body: { email: "ANA@clinica.com" } })).email).toBe("ana@clinica.com")
  })

  test("refuses an empty change and an unknown user", async () => {
    const user = await create()
    expect((await failure(useCases.commands.updateUser({ clinicId: CLINIC, actor, id: user.id, body: {} }))).message).toBe("validation")
    expect((await failure(useCases.commands.updateUser({ clinicId: CLINIC, actor, id: "nope", body: { name: "Zé" } }))).message).toBe("not_found")
  })
})

describe("the last administrator", () => {
  test("cannot be deactivated, lose the role or be removed", async () => {
    const admin = await create({ roles: ["admin"] })
    const cases = [
      useCases.commands.updateUser({ clinicId: CLINIC, actor, id: admin.id, body: { active: false } }),
      useCases.commands.updateUser({ clinicId: CLINIC, actor, id: admin.id, body: { roles: ["reception"] } }),
      useCases.commands.setUserRoles({ clinicId: CLINIC, actor, id: admin.id, body: { roles: ["finance"] } }),
      useCases.commands.deactivateUser({ clinicId: CLINIC, actor, id: admin.id }),
    ]
    for (const attempt of cases) {
      const error = await failure(attempt)
      expect(error.message).toBe("conflict")
      expect((error as DomainError).detail).toBe("A clínica precisa de ao menos um administrador ativo.")
    }
    expect(repository.users[0]).toMatchObject({ active: true, roles: ["admin"] })
  })

  test("can be deactivated once another active administrator exists", async () => {
    const first = await create({ roles: ["admin"] })
    await create({ email: "b@clinica.com", roles: ["admin"] })
    const removed = await useCases.commands.deactivateUser({ clinicId: CLINIC, actor, id: first.id })
    expect(removed.active).toBe(false)
    expect(repository.revoked).toEqual([first.id])
  })

  test("an inactive administrator does not count as a second one", async () => {
    const first = await create({ roles: ["admin"] })
    const second = await create({ email: "b@clinica.com", roles: ["admin"] })
    await useCases.commands.deactivateUser({ clinicId: CLINIC, actor, id: second.id })
    expect((await failure(useCases.commands.deactivateUser({ clinicId: CLINIC, actor, id: first.id }))).message).toBe("conflict")
  })

  test("a non-administrator is free to change", async () => {
    await create({ roles: ["admin"] })
    const other = await create({ email: "b@clinica.com", roles: ["reception"] })
    expect((await useCases.commands.deactivateUser({ clinicId: CLINIC, actor, id: other.id })).active).toBe(false)
  })
})

describe("setUserRoles", () => {
  test("replaces the whole set, validated against the clinic's roles", async () => {
    const user = await create()
    const updated = await useCases.commands.setUserRoles({ clinicId: CLINIC, actor, id: user.id, body: { roles: ["professional", "manager", "manager"] } })
    expect(updated.roles).toEqual(["professional", "manager"])
    expect(repository.audits.at(-1)).toMatchObject({ summary: "Alterou os papéis de um usuário", changedFields: ["roles"] })
    expect((await failure(useCases.commands.setUserRoles({ clinicId: CLINIC, actor, id: user.id, body: { roles: ["ghost"] } }))).message).toBe("validation")
  })
})

describe("resetPassword", () => {
  test("stores the new hash, ends the sessions and never audits the password", async () => {
    const user = await create()
    await useCases.commands.resetPassword({ clinicId: CLINIC, actor, id: user.id, body: { password: "outra-senha-1" } })
    expect(repository.hashes.get(user.id)).toBe("hashed:outra-senha-1")
    expect(repository.revoked).toEqual([user.id])
    expect(repository.audits.at(-1)).toEqual({ action: "password_reset", resource: "user", summary: "Redefiniu a senha de um usuário" })
  })

  test("refuses a short password and keeps the old hash", async () => {
    const user = await create()
    expect((await failure(useCases.commands.resetPassword({ clinicId: CLINIC, actor, id: user.id, body: { password: "1234567" } }))).message).toBe("validation")
    expect(repository.hashes.get(user.id)).toBe("hashed:senha-forte")
  })
})

describe("roles and permissions", () => {
  test("lists the roles with their effective permissions and user counts", async () => {
    await create({ roles: ["admin"] })
    const admin = (await useCases.queries.listRoles({ clinicId: CLINIC })).find((role) => role.key === "admin")!
    expect(admin.userCount).toBe(1)
    expect(admin.permissions).toContain("users:manage")
    expect(admin.permissions).not.toContain("clinical:read")
  })

  test("groups the catalog for the matrix", async () => {
    const groups = await useCases.queries.listPermissions()
    expect(groups.map((g) => g.group)).toContain("Administração")
    expect(groups.flatMap((g) => g.permissions).map((p) => p.key)).toContain("users:manage")
  })

  test("saves a known permission set and drops duplicates", async () => {
    const role = await useCases.commands.setRolePermissions({
      clinicId: CLINIC, actor, roleKey: "reception", body: { permissions: ["patients:read", "patients:read", "dashboard:read"] },
    })
    expect(role.permissions).toEqual(["patients:read", "dashboard:read"])
    expect(repository.audits.at(-1)).toMatchObject({ resource: "role", changedFields: ["permissions"] })
  })

  test("refuses an unknown permission", async () => {
    const error = await failure(
      useCases.commands.setRolePermissions({ clinicId: CLINIC, actor, roleKey: "reception", body: { permissions: ["patients:fly"] } }),
    )
    expect(error.message).toBe("validation")
    expect((error as DomainError).detail).toContain("patients:fly")
  })

  test("never gives the administrator clinical permissions and never takes away its locked ones", async () => {
    const withClinical = ["users:read", "users:manage", "settings:manage", "clinical:read"]
    expect((await failure(useCases.commands.setRolePermissions({ clinicId: CLINIC, actor, roleKey: "admin", body: { permissions: withClinical } }))).message).toBe("validation")
    const withoutLocked = ["dashboard:read", "users:read"]
    expect((await failure(useCases.commands.setRolePermissions({ clinicId: CLINIC, actor, roleKey: "admin", body: { permissions: withoutLocked } }))).message).toBe("validation")
  })

  test("refuses an unknown role and a malformed body", async () => {
    expect((await failure(useCases.commands.setRolePermissions({ clinicId: CLINIC, actor, roleKey: "ghost", body: { permissions: [] } }))).message).toBe("not_found")
    expect((await failure(useCases.commands.setRolePermissions({ clinicId: CLINIC, actor, roleKey: "reception", body: { permissions: "all" } }))).message).toBe("validation")
  })
})
