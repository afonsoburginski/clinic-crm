import { PanelShell } from "@/shared/ui/templates/panel-shell"

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>
}
