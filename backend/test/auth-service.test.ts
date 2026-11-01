import { beforeEach, describe, expect, test } from "bun:test"
import { createAuth, hasPermission, permissionFor } from "@/application/auth"
import type { AuthSessionStore } from "@/application/ports/auth-sessions"
import type { ProvisionedUser, UserCredentials, UserDirectory } from "@/application/ports/users"
import { defaultMatrix } from "@/domain/permissions"

const CLINIC = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const SECRET = "x".repeat(32)

class FakeDirectory implements UserDirectory {
  ready: Array<{ clinicId: string; provisioned: readonly ProvisionedUser[] }> = []
  failReadyOnce = false
  users: UserCredentials[] = []
  matrix = defaultMatrix()
  async ensureReady(clinicId: string, provisioned: readonly ProvisionedUser[]) {
    if (this.failReadyOnce) {
      this.failReadyOnce = false
      throw new Error("boom")
    }
    this.ready.push({ clinicId, provisioned })
  }
  async findCredentials(_clinicId: string, email: string) {
    return this.users.find((user) => user.email === email.trim().toLowerCase())
  }
  async findById(_clinicId: string, id: string) {
    return this.users.find((user) => user.id === id)
  }
  async rolePermissions() {
    return this.matrix
  }
}

class FakeSessions implements AuthSessionStore {
  failures = new Map<string, number>()
  locked = new Map<string, Date>()
  sessions = new Map<string, { userId: string; revoked: boolean }>()
  async lockedUntil(emailHash: string) {
    return this.locked.get(emailHash) ?? null
  }
  async recordFailure(emailHash: string) {
    this.failures.set(emailHash, (this.failures.get(emailHash) ?? 0) + 1)
  }
  async clearFailures(emailHash: string) {
    this.failures.delete(emailHash)
  }
  async create(tokenHash: string, userId: string) {
    this.sessions.set(tokenHash, { userId, revoked: false })
  }
  async activeUserId(tokenHash: string) {
    const session = this.sessions.get(tokenHash)
    return session && !session.revoked ? session.userId : undefined
  }
  async revoke(tokenHash: string) {
    const session = this.sessions.get(tokenHash)
    if (session) session.revoked = true
  }
}

let directory: FakeDirectory
let sessions: FakeSessions
let usersJson: string | undefined
let secret: string | undefined
let auth: ReturnType<typeof createAuth>

const hash = (password: string) => Bun.password.hash(password, { algorithm: "bcrypt", cost: 4 })

async function addUser(overrides: Partial<UserCredentials> = {}) {
  const user: UserCredentials = {
    id: USER_ID, name: "Ana", email: "ana@clinica.com", active: true, roles: ["reception"], professionalId: null,
    createdAt: "", updatedAt: "", passwordHash: await hash("senha-forte"), ...overrides,
  }
  directory.users.push(user)
  return user
}

beforeEach(() => {
  directory = new FakeDirectory()
  sessions = new FakeSessions()
  usersJson = undefined
  secret = SECRET
  auth = createAuth({ directory, sessions, env: () => ({ secret, usersJson, clinicId: CLINIC }) })
})

const expectFailure = async (promise: Promise<unknown>, message: string) => {
  try {
    await promise
  } catch (error) {
    expect((error as Error).message).toBe(message)
    return
  }
  throw new Error("expected a failure")
}

describe("login", () => {
  test("returns the user with the effective permissions from the role matrix", async () => {
    await addUser({ roles: ["admin", "professional"] })
    const { user, accessToken } = await auth.login(" Ana@Clinica.com ", "senha-forte")
    expect(user.roles).toEqual(["admin", "professional"])
    expect(user.permissions).toContain("users:manage")
    expect(user.permissions).toContain("clinical:read")
    expect(hasPermission(user, "users:manage")).toBe(true)
    expect(accessToken.split(".")).toHaveLength(2)
  })

  test("follows the matrix edited in the database", async () => {
    await addUser()
    directory.matrix.set("reception", ["dashboard:read"])
    expect((await auth.login("ana@clinica.com", "senha-forte")).user.permissions).toEqual(["dashboard:read"])
  })

  test("a wrong password, an unknown e-mail and a deactivated user get the same refusal and count as failures", async () => {
    await addUser()
    await addUser({ id: "33333333-3333-4333-8333-333333333333", email: "off@clinica.com", active: false })
    await expectFailure(auth.login("ana@clinica.com", "errada"), "invalid_credentials")
    await expectFailure(auth.login("ninguem@clinica.com", "senha-forte"), "invalid_credentials")
    await expectFailure(auth.login("off@clinica.com", "senha-forte"), "invalid_credentials")
    expect([...sessions.failures.values()].reduce((a, b) => a + b, 0)).toBe(3)
  })

  test("a locked e-mail is refused before the password is checked", async () => {
    await addUser()
    const { createHash } = await import("node:crypto")
    sessions.locked.set(createHash("sha256").update("ana@clinica.com").digest("hex"), new Date(Date.now() + 60_000))
    await expectFailure(auth.login("ana@clinica.com", "senha-forte"), "login_locked")
  })

  test("is refused when the session secret is missing or short, or the clinic is not configured", async () => {
    secret = undefined
    await expectFailure(auth.login("a@b.com", "x"), "auth_unconfigured")
    secret = "curto"
    await expectFailure(auth.login("a@b.com", "x"), "auth_unconfigured")
    auth = createAuth({ directory, sessions, env: () => ({ secret: SECRET }) })
    await expectFailure(auth.login("a@b.com", "x"), "database_unconfigured")
  })
})

describe("session", () => {
  test("resolves the user and their permissions from the token", async () => {
    await addUser({ roles: ["finance"], professionalId: null })
    const { accessToken } = await auth.login("ana@clinica.com", "senha-forte")
    const user = await auth.session(accessToken)
    expect(user).toMatchObject({ id: USER_ID, roles: ["finance"] })
    expect(hasPermission(user, "finance:write")).toBe(true)
    expect(hasPermission(user, "users:read")).toBe(false)
  })

  test("a deactivated user's session stops working at once", async () => {
    const user = await addUser()
    const { accessToken } = await auth.login("ana@clinica.com", "senha-forte")
    user.active = false
    await expectFailure(auth.session(accessToken), "unauthorized")
  })

  test("a revoked session, a tampered token and a session of an unknown or non-uuid user are refused", async () => {
    await addUser()
    const { accessToken } = await auth.login("ana@clinica.com", "senha-forte")
    await expectFailure(auth.session(`${accessToken}x`), "unauthorized")
    await expectFailure(auth.session("sem-ponto"), "unauthorized")
    await auth.logout(accessToken)
    await expectFailure(auth.session(accessToken), "unauthorized")
  })

  test("a session left by the old env-provisioned users (non-uuid id) is refused", async () => {
    await addUser()
    const { createHash, createHmac } = await import("node:crypto")
    const raw = "legacy-token"
    const signature = createHmac("sha256", SECRET).update(raw).digest("base64url")
    sessions.sessions.set(createHash("sha256").update(raw).digest("hex"), { userId: "u1", revoked: false })
    await expectFailure(auth.session(`${raw}.${signature}`), "unauthorized")
  })

  test("permission changes apply on the next read", async () => {
    await addUser()
    const { accessToken } = await auth.login("ana@clinica.com", "senha-forte")
    expect(hasPermission(await auth.session(accessToken), "patients:write")).toBe(true)
    directory.matrix.set("reception", ["dashboard:read"])
    expect(hasPermission(await auth.session(accessToken), "patients:write")).toBe(false)
  })
})

describe("bootstrap", () => {
  const provisioned = [
    { id: "u1", name: "Admin", email: "admin@clinica.com", passwordHash: "h", roles: ["admin"] },
  ]

  test("prepares the clinic once per process and hands over the provisioned users", async () => {
    usersJson = JSON.stringify(provisioned)
    await addUser()
    await auth.login("ana@clinica.com", "senha-forte")
    await auth.login("ana@clinica.com", "senha-forte")
    expect(directory.ready).toHaveLength(1)
    expect(directory.ready[0]).toEqual({
      clinicId: CLINIC,
      provisioned: [{ ...provisioned[0], professionalId: undefined }],
    })
  })

  test("a malformed or unknown-role list is ignored as a whole", async () => {
    await addUser()
    for (const raw of ["not json", "{}", JSON.stringify([{ ...provisioned[0], roles: ["root"] }]), JSON.stringify([provisioned[0], {}])]) {
      usersJson = raw
      auth = createAuth({ directory, sessions, env: () => ({ secret, usersJson, clinicId: CLINIC }) })
      directory.ready = []
      await auth.login("ana@clinica.com", "senha-forte")
      expect(directory.ready[0].provisioned).toEqual([])
    }
  })

  test("a failed preparation is retried on the next call", async () => {
    await addUser()
    directory.failReadyOnce = true
    await expectFailure(auth.login("ana@clinica.com", "senha-forte"), "boom")
    await auth.login("ana@clinica.com", "senha-forte")
    expect(directory.ready).toHaveLength(1)
  })
})

describe("permissionFor", () => {
  test("users, roles and permissions need users:read to read and users:manage to write", () => {
    for (const path of ["/api/v1/users", "/api/v1/users/x", "/api/v1/roles", "/api/v1/permissions"]) {
      expect(permissionFor(path, "GET")).toBe("users:read")
    }
    for (const [method, path] of [
      ["POST", "/api/v1/users"], ["PATCH", "/api/v1/users/x"], ["DELETE", "/api/v1/users/x"],
      ["PUT", "/api/v1/users/x/roles"], ["POST", "/api/v1/users/x/password"], ["PUT", "/api/v1/roles/admin/permissions"],
    ]) {
      expect(permissionFor(path, method)).toBe("users:manage")
    }
  })
  test("unknown routes under users stay denied", () => {
    expect(permissionFor("/api/v1/users/x/secret", "GET")).toBeNull()
    expect(permissionFor("/api/v1/roles/x", "PUT")).toBeNull()
  })
})
