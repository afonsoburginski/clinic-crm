import type { Metadata } from "next"

import { AgendaView } from "@/modules/scheduling/components/agenda-view"

export const metadata: Metadata = { title: "Agenda" }

export default function AgendaPage() {
  return <AgendaView />
}
