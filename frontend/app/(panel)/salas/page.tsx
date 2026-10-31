import type { Metadata } from "next"

import { RoomsView } from "@/modules/catalog/components/rooms-view"

export const metadata: Metadata = { title: "Salas" }

export default function RoomsPage() {
  return <RoomsView />
}
