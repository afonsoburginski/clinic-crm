import { Archive, Copy, ExternalLink, PencilLine, Send, Share2 } from "lucide-react"

import { canTransitionDocument } from "@/domain/documents"
import type { PatientDocument } from "@/domain/types"
import type { EntityAction } from "@/shared/ui/entity-menu"

export interface DocumentActionHandlers {
  onView: () => void
  onEdit: () => void
  /** Abre o diálogo de novo documento preenchido com os dados deste rascunho. */
  onDuplicate: () => void
  onIssue: () => void | Promise<unknown>
  onArchive: () => void | Promise<unknown>
}

/**
 * Ações de um documento. O acesso é decidido pela classificação (RN-DOC-001): `canWrite` vem da API e
 * substitui a permissão; documentos não são excluídos, só arquivados (o que revoga as liberações ativas).
 */
export function documentActions(doc: PatientDocument, canWrite: boolean, handlers: DocumentActionHandlers): EntityAction[] {
  const draft = doc.status === "draft"
  return [
    { id: "view", label: "Ver documento", icon: ExternalLink, onSelect: handlers.onView },
    { id: "edit", label: "Editar rascunho", icon: PencilLine, hidden: !canWrite || !draft, onSelect: handlers.onEdit },
    { id: "duplicate", label: "Duplicar rascunho", icon: Copy, hidden: !canWrite || !draft, onSelect: handlers.onDuplicate },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: doc.id, group: "clipboard" },
    {
      id: "issue",
      label: "Emitir documento",
      icon: Send,
      group: "status",
      hidden: !canWrite || !canTransitionDocument(doc.status, "issued"),
      confirm: { title: "Emitir documento?", description: "Depois de emitido, o documento não pode mais ser editado.", confirmLabel: "Emitir" },
      onSelect: () => handlers.onIssue(),
    },
    {
      id: "release",
      label: "Gerenciar liberações",
      icon: Share2,
      group: "status",
      hidden: !canWrite || doc.status !== "issued",
      onSelect: handlers.onView,
    },
    {
      id: "archive",
      label: "Arquivar documento",
      icon: Archive,
      hidden: !canWrite || !canTransitionDocument(doc.status, "archived"),
      destructive: true,
      confirm: {
        title: "Arquivar documento?",
        description: "Arquivar é definitivo e revoga as liberações ativas. O registro permanece para consulta.",
        confirmLabel: "Arquivar",
      },
      onSelect: () => handlers.onArchive(),
    },
  ]
}
