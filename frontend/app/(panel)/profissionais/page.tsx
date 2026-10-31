import type { Metadata } from "next"

import { ProfessionalsListView } from "@/modules/catalog/components/professionals-list-view"

export const metadata: Metadata = { title: "Profissionais" }

export default function ProfessionalsPage() {
  return <ProfessionalsListView />
}
