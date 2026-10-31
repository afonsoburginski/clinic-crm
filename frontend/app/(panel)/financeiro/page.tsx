import type { Metadata } from "next"

import { FinancialView } from "@/modules/financial"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"

export const metadata: Metadata = { title: "Financeiro" }

export default function FinancialPage() {
  return (
    <PermissionGate permission="finance:read" fallback={<AccessDenied description="O financeiro é restrito aos perfis Financeiro e Administração." />}>
      <FinancialView />
    </PermissionGate>
  )
}
