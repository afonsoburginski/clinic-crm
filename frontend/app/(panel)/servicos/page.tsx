import type { Metadata } from "next"

import { ServicesView } from "@/modules/catalog/components/services-view"

export const metadata: Metadata = { title: "Serviços" }

export default function ServicesPage() {
  return <ServicesView />
}
