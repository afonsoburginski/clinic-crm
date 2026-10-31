import type { Metadata } from "next"

import { ProfessionalDetailView } from "@/modules/catalog/components/professional-detail-view"

export const metadata: Metadata = { title: "Profissional" }

export default async function ProfessionalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProfessionalDetailView id={id} />
}
