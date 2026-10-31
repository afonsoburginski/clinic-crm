import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { AuthSessionStore } from "@/application/ports/auth-sessions"
import type { UserDirectory } from "@/application/ports/users"
import { parseProvisionedUsers } from "@/application/use-cases/provisioned-users"
import { effectivePermissions, SYSTEM_ROLE_KEYS } from "@/domain/permissions"

/** Role keys come from the database (`roles`); the system roles are the ones every clinic starts with. */
export type Role = string
export type User = { id: string; name: string; email: string; roles: Role[]; permissions: string[]; professionalId?: string }

/** The effective permissions are resolved when the session is read, from the persisted role matrix. */
export function hasPermission(user: User, permission: string) {
  return user.permissions.includes(permission)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
/** Verified for unknown or inactive e-mails so the response time does not reveal them. */
const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuuCwQvM5sN6q.XjMJ7Z6n9L6kG8VPRU9a"

const digest = (s: string) => createHash("sha256").update(s).digest("hex")

async function verifyPassword(password: string, hash: string) {
  try {
    return await Bun.password.verify(password, hash)
  } catch {
    return false
  }
}

export interface AuthEnv {
  /** `AUTH_SESSION_SECRET`, at least 32 characters. */
  secret?: string
  /** `AUTH_USERS_JSON`: bootstrap list imported once into a clinic that has no users. */
  usersJson?: string
  clinicId?: string
}

export interface AuthDeps {
  directory: UserDirectory
  sessions: AuthSessionStore
  /** Read on every call: the environment can change between requests (tests do). */
  env: () => AuthEnv
}

export function createAuth({ directory, sessions, env }: AuthDeps) {
  const ready = new Map<string, Promise<void>>()

  function settings() {
    const { secret, usersJson, clinicId } = env()
    if (!secret || secret.length < 32) throw new Error("auth_unconfigured")
    if (!clinicId) throw new Error("database_unconfigured")
    return { secret, usersJson, clinicId }
  }

  /** Seeds roles and permissions (and imports the bootstrap users) once per process; a failure is retried. */
  function ensureReady(clinicId: string, usersJson: string | undefined) {
    let pending = ready.get(clinicId)
    if (!pending) {
      pending = directory.ensureReady(clinicId, parseProvisionedUsers(usersJson, SYSTEM_ROLE_KEYS)).catch((error) => {
        ready.delete(clinicId)
        throw error
      })
      ready.set(clinicId, pending)
    }
    return pending
  }

  async function permissionsOf(clinicId: string, roles: readonly string[]) {
    return effectivePermissions(roles, await directory.rolePermissions(clinicId))
  }

  return {
    async login(email: string, password: string) {
      const { secret, usersJson, clinicId } = settings()
      await ensureReady(clinicId, usersJson)
      const key = digest(email.trim().toLowerCase())
      const lockedUntil = await sessions.lockedUntil(key)
      if (lockedUntil && lockedUntil > new Date()) throw new Error("login_locked")
      const found = await directory.findCredentials(clinicId, email)
      const usable = found?.active ? found : undefined
      const valid = await verifyPassword(password, usable?.passwordHash ?? DUMMY_HASH)
      if (!valid || !usable) {
        await sessions.recordFailure(key)
        throw new Error("invalid_credentials")
      }
      await sessions.clearFailures(key)
      const token = randomBytes(32).toString("base64url")
      const expires = new Date(Date.now() + SESSION_TTL_MS)
      const user: User = {
        id: usable.id,
        name: usable.name,
        email: usable.email,
        roles: usable.roles,
        permissions: await permissionsOf(clinicId, usable.roles),
        professionalId: usable.professionalId ?? undefined,
      }
      const signature = createHmac("sha256", secret).update(token).digest("base64url")
      await sessions.create(digest(token), user.id, expires)
      return { user, accessToken: `${token}.${signature}`, expiresAt: expires.toISOString() }
    },

    /** A deactivated user's sessions stop working at once, even before they are revoked. */
    async session(token: string): Promise<User> {
      const { secret, usersJson, clinicId } = settings()
      const [raw, sig, ...rest] = token.split(".")
      if (!raw || !sig || rest.length) throw new Error("unauthorized")
      const expected = createHmac("sha256", secret).update(raw).digest("base64url")
      if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        throw new Error("unauthorized")
      }
      await ensureReady(clinicId, usersJson)
      const userId = await sessions.activeUserId(digest(raw))
      if (!userId || !UUID.test(userId)) throw new Error("unauthorized")
      const record = await directory.findById(clinicId, userId)
      if (!record?.active) throw new Error("unauthorized")
      return {
        id: record.id,
        name: record.name,
        email: record.email,
        roles: record.roles,
        permissions: await permissionsOf(clinicId, record.roles),
        professionalId: record.professionalId ?? undefined,
      }
    },

    async logout(token: string) {
      const raw = token.split(".")[0]
      if (raw) await sessions.revoke(digest(raw))
    },
  }
}

export type Auth = ReturnType<typeof createAuth>

/** Sentinel for routes any signed-in user may call: they only touch the caller's own data (their table preferences). */
export const AUTHENTICATED = "session:authenticated"

export function permissionFor(path: string, method: string) {
  const p = path.replace(/\/$/, "")
  if (p === "/api/v1/auth/login" || p === "/api/v1/auth/session" || p === "/api/v1/auth/logout") return null
  if (/^\/api\/v1\/(?:clinical(?:-records(?:\/[^/]+(?:\/(?:finalize|rectifications|versions))?)?|\/patients)|assessments(?:\/[^/]+(?:\/(?:stages|interpretations|complete|cancel))?)?|aba\/(?:plans(?:\/[^/]+(?:\/(?:activate|close|goals(?:\/[^/]+)?))?)?|sessions(?:\/[^/]+\/void)?))$/.test(p)) return method === "GET" ? "clinical:read" : "clinical:write"
  if (p === "/api/v1/financial/export") return method === "GET" ? "finance:export" : null
  if (/^\/api\/v1\/financial\/(?:entries(?:\/[^/]+(?:\/(?:payments|cancel))?)?|payments\/[^/]+\/reverse|summary|report)$/.test(p)) return method === "GET" ? "finance:read" : "finance:write"
  if (/^\/api\/v1\/documents(?:\/[^/]+(?:\/(?:status|releases(?:\/[^/]+\/revoke)?))?)?$/.test(p)) return method === "GET" ? "documents:read" : "documents:write"
  if (/^\/api\/v1\/(?:users(?:\/[^/]+(?:\/(?:password|roles))?)?|roles(?:\/[^/]+\/permissions)?|permissions)$/.test(p)) return method === "GET" ? "users:read" : "users:manage"
  if (/^\/api\/v1\/preferences\/tables\/[^/]+(?:\/views\/[^/]+)?$/.test(p)) {
    const view = p.includes("/views/")
    if (view ? method === "PUT" || method === "DELETE" : method === "GET") return AUTHENTICATED
    return null
  }
  if (p === "/api/v1/settings") return "settings:manage"
  if (p === "/api/v1/audit") return "audit:read"
  if (/^\/api\/v1\/(?:professionals(?:\/[^/]+(?:\/(?:schedule|unavailabilities(?:\/[^/]+)?))?)?|specialties(?:\/[^/]+)?|services(?:\/[^/]+)?|rooms(?:\/[^/]+)?)$/.test(p)) return "professionals:manage"
  if (/^\/api\/v1\/appointments(?:\/[^/]+(?:\/(?:transitions|status))?)?$/.test(p) || p === "/api/v1/appointments/suggestions") return method === "GET" ? "appointments:read" : "appointments:write"
  if (/^\/api\/v1\/(?:patients(?:\/[^/]+(?:\/appointments)?)?|guardians(?:\/[^/]+)?|patient-guardians(?:\/[^/]+)?)$/.test(p)) return method === "GET" ? "patients:read" : "patients:write"
  if (p === "/api/v1/dashboard/summary") return "dashboard:read"
  return null
}
