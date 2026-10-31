import type { Metadata } from "next"

import { AssessmentDetailView } from "@/modules/assessments"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"

export const metadata: Metadata = { title: "Avaliação" }

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <PermissionGate permission="clinical:read" fallback={<AccessDenied description="Avaliações são restritas ao perfil clínico." />}>
      <AssessmentDetailView id={id} />
    </PermissionGate>
  )
}
