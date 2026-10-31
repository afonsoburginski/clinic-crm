import type { Metadata } from "next"

import { RecordsHomeView } from "@/modules/clinical-records"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"

export const metadata: Metadata = { title: "Prontuários" }

export default function RecordsPage() {
  return (
    <PermissionGate permission="clinical:read" fallback={<AccessDenied description="Prontuários são restritos a profissionais com vínculo ao paciente." />}>
      <RecordsHomeView />
    </PermissionGate>
  )
}
