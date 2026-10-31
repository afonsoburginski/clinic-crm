import { CircleCheck, ExternalLink } from "lucide-react"

import type { Assessment } from "@/domain/types"
import type { EntityAction } from "@/shared/ui/entity-menu"

export interface AssessmentActionHandlers {
  onView: () => void
  onComplete: () => void | Promise<unknown>
  onCancel: (reason: string) => void | Promise<unknown>
  /** O usuário da sessão é o profissional responsável pela avaliação (só ele conclui ou cancela). */
  isResponsible: boolean
}

/** Por que a avaliação ainda não pode ser concluída (RN-AVA): etapas e interpretação. `undefined` = pode. */
export function completionBlocker(assessment: Assessment): string | undefined {
  if (assessment.stages.some((stage) => stage.status !== "done")) return "Conclua todas as etapas antes de concluir a avaliação."
  if (assessment.interpretations.length === 0) return "Registre ao menos uma interpretação antes de concluir a avaliação."
  return undefined
}

/** Ações de uma avaliação. Não há exclusão: a avaliação em andamento é cancelada (com motivo) e o histórico é preservado. */
export function assessmentActions(assessment: Assessment, handlers: AssessmentActionHandlers & { inDetail?: boolean }): EntityAction[] {
  const open = assessment.status === "in_progress"
  const notResponsible = !handlers.isResponsible && "Só o profissional responsável pode fazer isso."
  return [
    { id: "view", label: "Ver avaliação", icon: ExternalLink, hidden: handlers.inDetail, onSelect: handlers.onView },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: assessment.id, group: "clipboard" },
    {
      id: "complete",
      label: "Concluir avaliação",
      icon: CircleCheck,
      permission: "clinical:write",
      group: "status",
      hidden: !open,
      disabled: notResponsible || completionBlocker(assessment) || false,
      confirm: {
        title: "Concluir avaliação?",
        description: "Depois de concluída, a avaliação fica somente leitura.",
        confirmLabel: "Concluir",
      },
      onSelect: () => handlers.onComplete(),
    },
    {
      id: "cancel",
      label: "Cancelar avaliação",
      permission: "clinical:write",
      hidden: !open,
      disabled: notResponsible,
      destructive: true,
      confirm: {
        title: "Cancelar avaliação?",
        description: "O histórico e as interpretações já registradas são preservados.",
        confirmLabel: "Cancelar avaliação",
        reason: { label: "Motivo do cancelamento (mínimo 5 caracteres)", required: true },
      },
      onSelect: (reason) => handlers.onCancel(reason ?? ""),
    },
  ]
}
