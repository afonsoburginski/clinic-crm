import type { Metadata } from "next"

import { GuardiansListView } from "@/modules/patients/components/guardians-list-view"

export const metadata: Metadata = { title: "Responsáveis" }

export default function GuardiansPage() {
  return <GuardiansListView />
}
