import type { Metadata } from "next"

import { PatientDetailView } from "@/modules/patients/components/patient-detail-view"

export const metadata: Metadata = { title: "Paciente" }

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PatientDetailView id={id} />
}
