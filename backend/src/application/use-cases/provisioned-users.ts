import type { ProvisionedUser } from "@/application/ports/users"
import { isRecord } from "@/application/use-cases/clinical-payload"

/**
 * Reads `AUTH_USERS_JSON`, the bootstrap list kept from before users lived in the database. Anything that is not a
 * well-formed list of users with known roles is ignored as a whole: a half-imported list would be worse than none.
 */
export function parseProvisionedUsers(raw: string | undefined, knownRoles: readonly string[]): ProvisionedUser[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const users: ProvisionedUser[] = []
    for (const item of parsed) {
      if (!isRecord(item)) return []
      const { id, name, email, passwordHash, roles, professionalId } = item
      const wellFormed =
        typeof id === "string" && id && typeof email === "string" && email && typeof passwordHash === "string" &&
        passwordHash && Array.isArray(roles) && roles.length > 0 &&
        roles.every((role) => typeof role === "string" && knownRoles.includes(role))
      if (!wellFormed) return []
      users.push({
        id,
        name: typeof name === "string" && name.trim() ? name : email,
        email,
        passwordHash,
        roles: roles as string[],
        professionalId: typeof professionalId === "string" && professionalId ? professionalId : undefined,
      })
    }
    return users
  } catch {
    return []
  }
}
