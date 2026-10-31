import type { Metadata } from "next"

import { AbaPlansView } from "@/modules/aba"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"

export const metadata: Metadata = { title: "Plano ABA" }

export default function AbaPage() {
  return (
    <PermissionGate permission="clinical:read" fallback={<AccessDenied description="Planos ABA são restritos ao perfil clínico." />}>
      <AbaPlansView />
    </PermissionGate>
  )
}
