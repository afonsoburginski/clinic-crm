import type { Metadata } from "next"

import { DocumentsView } from "@/modules/documents"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"

export const metadata: Metadata = { title: "Documentos" }

export default function DocumentsPage() {
  return (
    <PermissionGate permission="documents:read" fallback={<AccessDenied description="Seu perfil não tem acesso a documentos." />}>
      <DocumentsView />
    </PermissionGate>
  )
}
