import type { Metadata } from "next"

import { NewPatientView } from "@/modules/patients/components/patient-form-views"

export const metadata: Metadata = { title: "Novo paciente" }

export default function NewPatientPage() {
  return <NewPatientView />
}
