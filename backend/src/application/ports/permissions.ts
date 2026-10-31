import type { Actor } from "@/application/ports/patient-access"

/** Role-based permission lookup, e.g. `clinical:read`. */
export interface PermissionPolicy {
  has(actor: Actor, permission: string): boolean
}
