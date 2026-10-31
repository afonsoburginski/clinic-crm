import { ExternalLink, FileCheck2, PencilLine, Undo2 } from "lucide-react"

import { MIN_CONTENT_TO_FINALIZE, MIN_RECTIFICATION_REASON } from "@/domain/clinical-record"
import type { ClinicalRecord } from "@/domain/types"
import type { EntityAction } from "@/shared/ui/entity-menu"

export interface RecordActionHandlers {
  onView: () => void
  onEdit: () => void
  onFinalize: () => void | Promise<unknown>
  onRectify: (reason: string) => void | Promise<unknown>
  /** O usuário da sessão escreveu o registro (só o autor edita, finaliza e retifica). */
  isAuthor: boolean
}

/**
 * Ações de um registro do prontuário. Registros clínicos nunca são excluídos: o rascunho é editado, o finalizado é
 * retificado (nova versão, a anterior fica preservada) — por isso não há ação destrutiva.
 */
export function recordActions(record: ClinicalRecord, handlers: RecordActionHandlers): EntityAction[] {
  const draft = record.status === "draft"
  const authorOnly = !handlers.isAuthor && "Só o autor do registro pode fazer isso."
  const tooShort = record.content.trim().length < MIN_CONTENT_TO_FINALIZE && `O conteúdo precisa ter ao menos ${MIN_CONTENT_TO_FINALIZE} caracteres para finalizar.`
  return [
    { id: "view", label: "Ver registro", icon: ExternalLink, onSelect: handlers.onView },
    { id: "edit", label: "Editar rascunho", icon: PencilLine, permission: "clinical:write", hidden: !draft, disabled: authorOnly, onSelect: handlers.onEdit },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: record.id, group: "clipboard" },
    {
      id: "finalize",
      label: "Finalizar registro",
      icon: FileCheck2,
      permission: "clinical:write",
      group: "status",
      hidden: !draft,
      disabled: authorOnly || tooShort || false,
      confirm: {
        title: "Finalizar registro?",
        description: "Depois de finalizado, o registro não pode ser editado — só retificado, com motivo e nova versão.",
        confirmLabel: "Finalizar",
      },
      onSelect: () => handlers.onFinalize(),
    },
    {
      id: "rectify",
      label: "Retificar registro",
      icon: Undo2,
      permission: "clinical:write",
      group: "status",
      hidden: record.status !== "finalized",
      disabled: authorOnly,
      confirm: {
        title: "Retificar registro?",
        description: "Abre uma nova versão em rascunho. A versão atual permanece preservada, com autoria e conteúdo originais.",
        confirmLabel: "Iniciar retificação",
        reason: { label: `Motivo da retificação (mínimo ${MIN_RECTIFICATION_REASON} caracteres)`, required: true },
      },
      onSelect: (reason) => handlers.onRectify(reason ?? ""),
    },
  ]
}

/** Ações de um paciente na lista de prontuários. */
export function chartActions(patient: { id: string; code: string }, handlers: { onOpen: () => void }): EntityAction[] {
  return [
    { id: "open", label: "Abrir prontuário", icon: ExternalLink, onSelect: handlers.onOpen },
    { id: "copy-code", label: "Copiar código", kind: "copy", text: patient.code, group: "clipboard" },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: patient.id, group: "clipboard" },
  ]
}
