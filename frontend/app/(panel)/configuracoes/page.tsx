import type { Metadata } from "next"

import { SettingsView } from "@/modules/settings/components/settings-view"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"

export const metadata: Metadata = { title: "Configurações" }

export default function SettingsPage() {
  return (
    <PermissionGate permission="settings:manage" fallback={<AccessDenied />}>
      <SettingsView />
    </PermissionGate>
  )
}
