import type { Metadata } from "next"

import { PatientChartView } from "@/modules/clinical-records"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"

export const metadata: Metadata = { title: "Prontuário" }

export default async function PatientChartPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params
  return (
    <PermissionGate permission="clinical:read" fallback={<AccessDenied description="Prontuários são restritos a profissionais com vínculo ao paciente." />}>
      <PatientChartView patientId={patientId} />
    </PermissionGate>
  )
}
