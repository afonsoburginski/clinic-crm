import { Banknote, Copy, ExternalLink, PencilLine, Undo2 } from "lucide-react"

import type { FinancialEntryStatus } from "@/domain/types"
import type { FinancialEntry } from "@/domain/types"
import { formatCurrency } from "@/shared/lib/format"
import type { EntityAction } from "@/shared/ui/entity-menu"

export interface FinancialActionHandlers {
  onView: () => void
  onEdit: () => void
  /** Abre o diálogo de novo lançamento preenchido com os dados deste (sem pagamentos). */
  onDuplicate: () => void
  /** Abre o detalhe, onde ficam o formulário de pagamento e os estornos. */
  onPay: () => void
  onCancel: (reason: string) => void | Promise<unknown>
}

interface FinancialActionRow {
  entry: FinancialEntry
  paidCents: number
  balanceCents: number
  status: FinancialEntryStatus
}

/**
 * Ações de um lançamento. Lançamentos não são excluídos: o cancelamento exige motivo e só vale sem pagamentos ativos
 * (RN-FIN-006); o estorno de pagamento é feito no detalhe. Escrever exige `finance:write`.
 */
export function financialActions(row: FinancialActionRow, handlers: FinancialActionHandlers): EntityAction[] {
  const { entry } = row
  const cancelled = row.status === "cancelled"
  const hasPayments = row.paidCents > 0
  return [
    { id: "view", label: "Ver detalhes", icon: ExternalLink, onSelect: handlers.onView },
    { id: "edit", label: "Editar lançamento", icon: PencilLine, permission: "finance:write", hidden: cancelled, onSelect: handlers.onEdit },
    { id: "duplicate", label: "Duplicar", icon: Copy, permission: "finance:write", onSelect: handlers.onDuplicate },
    { id: "copy-code", label: "Copiar código", kind: "copy", text: entry.code, group: "clipboard" },
    { id: "copy-amount", label: "Copiar valor", kind: "copy", text: formatCurrency(entry.amountCents), group: "clipboard" },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: entry.id, group: "clipboard" },
    {
      id: "pay",
      label: entry.kind === "income" ? "Registrar recebimento" : "Registrar pagamento",
      icon: Banknote,
      permission: "finance:write",
      group: "status",
      hidden: cancelled || row.balanceCents <= 0,
      onSelect: handlers.onPay,
    },
    {
      id: "reverse",
      label: "Estornar pagamento…",
      icon: Undo2,
      permission: "finance:write",
      group: "status",
      hidden: cancelled || !hasPayments,
      onSelect: handlers.onView,
    },
    {
      id: "cancel",
      label: "Cancelar lançamento",
      permission: "finance:write",
      hidden: cancelled,
      disabled: hasPayments && "Estorne os pagamentos antes de cancelar.",
      destructive: true,
      confirm: {
        title: "Cancelar lançamento?",
        description: "O lançamento permanece no histórico, marcado como cancelado, e deixa de contar nos resumos. Não há exclusão.",
        confirmLabel: "Cancelar lançamento",
        reason: { label: "Motivo do cancelamento (mínimo 5 caracteres)", required: true },
      },
      onSelect: (reason) => handlers.onCancel(reason ?? ""),
    },
  ]
}
