import type { Actor } from "@/application/ports/patient-access"
import type { PermissionPolicy } from "@/application/ports/permissions"

export class FakePermissions implements PermissionPolicy {
  granted = new Set<string>()
  checked: Array<{ actor: Actor; permission: string }> = []

  has(actor: Actor, permission: string) {
    this.checked.push({ actor, permission })
    return this.granted.has(permission)
  }
}
