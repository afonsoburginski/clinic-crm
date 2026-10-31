import type { Metadata } from "next"

import { AbaPlanDetailView } from "@/modules/aba"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"

export const metadata: Metadata = { title: "Plano ABA" }

export default async function AbaPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <PermissionGate permission="clinical:read" fallback={<AccessDenied description="Planos ABA são restritos ao perfil clínico." />}>
      <AbaPlanDetailView id={id} />
    </PermissionGate>
  )
}
