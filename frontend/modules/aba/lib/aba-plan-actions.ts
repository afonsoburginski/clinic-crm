import { CirclePlay, Copy, ExternalLink, PencilLine, Square } from "lucide-react"

import type { AbaPlan } from "@/domain/types"
import type { EntityAction } from "@/shared/ui/entity-menu"

export interface AbaPlanActionHandlers {
  onView: () => void
  onEdit: () => void
  /** Abre o diálogo de novo plano preenchido com os dados deste (sem objetivos nem sessões). */
  onDuplicate: () => void
  onActivate: () => void | Promise<unknown>
  onClose: (reason: string) => void | Promise<unknown>
}

/** Ações de um plano ABA. Não há exclusão: o plano é encerrado (com motivo) e continua consultável. */
export function abaPlanActions(plan: AbaPlan, handlers: AbaPlanActionHandlers & { inDetail?: boolean }): EntityAction[] {
  const hasActiveGoal = plan.goals.some((goal) => goal.status === "active")
  return [
    { id: "view", label: "Ver plano", icon: ExternalLink, hidden: handlers.inDetail, onSelect: handlers.onView },
    { id: "edit", label: "Editar plano", icon: PencilLine, permission: "clinical:write", hidden: plan.status === "closed", onSelect: handlers.onEdit },
    { id: "duplicate", label: "Duplicar", icon: Copy, permission: "clinical:write", onSelect: handlers.onDuplicate },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: plan.id, group: "clipboard" },
    {
      id: "activate",
      label: "Ativar plano",
      icon: CirclePlay,
      permission: "clinical:write",
      group: "status",
      hidden: plan.status !== "draft",
      disabled: !hasActiveGoal && "Inclua ao menos um objetivo antes de ativar o plano.",
      confirm: { title: "Ativar plano?", description: "Com o plano ativo é possível registrar sessões. O plano não volta a rascunho.", confirmLabel: "Ativar" },
      onSelect: () => handlers.onActivate(),
    },
    {
      id: "close",
      label: "Encerrar plano",
      icon: Square,
      permission: "clinical:write",
      hidden: plan.status !== "active",
      destructive: true,
      confirm: {
        title: "Encerrar plano?",
        description: "O plano fica somente leitura e deixa de aceitar sessões. Objetivos, sessões e histórico permanecem para consulta.",
        confirmLabel: "Encerrar plano",
        reason: { label: "Motivo do encerramento", required: true },
      },
      onSelect: (reason) => handlers.onClose(reason ?? ""),
    },
  ]
}
