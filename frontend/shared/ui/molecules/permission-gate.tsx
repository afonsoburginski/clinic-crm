"use client"

import type { Permission } from "@/domain/permissions"
import { useCan } from "@/shared/lib/current-user"

/** Esconde a UI sem a permissão. É conveniência visual — o adapter revalida toda ação. */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  return useCan(permission) ? <>{children}</> : <>{fallback}</>
}
