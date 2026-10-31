import type { Role } from "@/application/auth";
import { hasPermission } from "@/application/auth";
import type { PermissionPolicy } from "@/application/ports/permissions";

export const permissions: PermissionPolicy = {
  has: (actor, permission) =>
    hasPermission(
      { id: actor.userId, name: "", email: "", roles: [...actor.roles] as Role[], professionalId: actor.professionalId },
      permission,
    ),
};
