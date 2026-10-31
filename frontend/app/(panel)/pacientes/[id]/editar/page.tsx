import type { Metadata } from "next"

import { EditPatientView } from "@/modules/patients/components/patient-form-views"

export const metadata: Metadata = { title: "Editar paciente" }

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EditPatientView id={id} />
}
