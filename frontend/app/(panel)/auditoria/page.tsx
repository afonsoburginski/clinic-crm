import type { Metadata } from "next"

import { AuditView } from "@/modules/settings/components/audit-view"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"

export const metadata: Metadata = { title: "Auditoria" }

export default function AuditPage() {
  return (
    <PermissionGate permission="audit:read" fallback={<AccessDenied />}>
      <AuditView />
    </PermissionGate>
  )
}
