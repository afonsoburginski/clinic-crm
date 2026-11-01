import type { PermissionPolicy } from "@/application/ports/permissions";
import { hasAdminRole } from "@/domain/permissions";

/** The session resolves the effective permissions from the persisted role matrix; an actor without them has none. The administrator has them all. */
export const permissions: PermissionPolicy = {
  has: (actor, permission) => hasAdminRole(actor.roles) || (actor.permissions?.includes(permission) ?? false),
};
