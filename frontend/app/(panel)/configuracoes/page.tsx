import type { Metadata } from "next"

import { SettingsView } from "@/modules/settings/components/settings-view"

export const metadata: Metadata = { title: "Configurações" }

/** O acesso é por aba (`settings:manage` para a clínica, `users:read` para usuários e papéis): ver `SettingsView`. */
export default function SettingsPage() {
  return <SettingsView />
}
