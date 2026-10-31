import type { Metadata } from "next"

import { AssessmentsListView } from "@/modules/assessments"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"

export const metadata: Metadata = { title: "Avaliações" }

export default function AssessmentsPage() {
  return (
    <PermissionGate permission="clinical:read" fallback={<AccessDenied description="Avaliações são restritas ao perfil clínico." />}>
      <AssessmentsListView />
    </PermissionGate>
  )
}
