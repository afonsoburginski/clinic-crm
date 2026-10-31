import type { PermissionPolicy } from "@/application/ports/permissions";

/** The session resolves the effective permissions from the persisted role matrix; an actor without them has none. */
export const permissions: PermissionPolicy = {
  has: (actor, permission) => actor.permissions?.includes(permission) ?? false,
};
