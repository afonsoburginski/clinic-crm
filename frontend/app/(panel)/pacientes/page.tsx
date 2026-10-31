import type { Metadata } from "next"

import { PatientsListView } from "@/modules/patients/components/patients-list-view"

export const metadata: Metadata = { title: "Pacientes" }

export default function PatientsPage() {
  return <PatientsListView />
}
