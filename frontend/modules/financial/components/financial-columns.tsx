import { ENTRY_STATUS_LABELS, KIND_LABELS, METHOD_LABELS } from "@/domain/financial"
import { PAYMENT_METHODS } from "@/domain/schemas"
import type { FinancialEntryStatus, FinancialKind } from "@/domain/types"
import type { FinancialListRow } from "@/shared/api/api"
import { formatBirthDate, formatCurrency } from "@/shared/lib/format"
import type { DataTableColumn } from "@/shared/ui/data-table"

import { competenceLabel, EntryStatusPill } from "./entry-status-pill"

const KIND_OPTIONS = (Object.keys(KIND_LABELS) as FinancialKind[]).map((value) => ({ value, label: KIND_LABELS[value] }))
const STATUS_OPTIONS = (Object.keys(ENTRY_STATUS_LABELS) as FinancialEntryStatus[]).map((value) => ({ value, label: ENTRY_STATUS_LABELS[value] }))
const METHOD_OPTIONS = PAYMENT_METHODS.map((value) => ({ value, label: METHOD_LABELS[value] }))

/**
 * Colunas da tabela de lançamentos (modo servidor): os `filter` só declaram os controles da toolbar — quem
 * filtra, ordena e pagina é a API. Os ids casam com `lib/filters.ts` (`FILTER_COLUMNS`, ordenação).
 * Opções de categoria e competência vêm das facetas do relatório.
 */
export function financialColumns({ categories, competences }: { categories: string[]; competences: string[] }): DataTableColumn<FinancialListRow>[] {
  return [
    {
      id: "description",
      header: "Lançamento",
      accessorFn: ({ entry }) => entry.description,
      meta: { label: "Lançamento", alwaysVisible: true },
      cell: ({ row: { original: { entry } } }) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{entry.description}</span>
          <span className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{entry.code}</span> · {KIND_LABELS[entry.kind]} · {entry.category}
          </span>
        </div>
      ),
    },
    {
      id: "kind",
      header: "Tipo",
      accessorFn: ({ entry }) => KIND_LABELS[entry.kind],
      meta: { label: "Tipo", hideBelow: "md", filter: { kind: "status", label: "Tipo", options: KIND_OPTIONS, value: ({ entry }) => entry.kind } },
      cell: ({ row: { original: { entry } } }) => KIND_LABELS[entry.kind],
    },
    {
      id: "category",
      header: "Categoria",
      accessorFn: ({ entry }) => entry.category,
      meta: {
        label: "Categoria",
        hideBelow: "lg",
        className: "text-muted-foreground",
        filter: { kind: "multiselect", label: "Categoria", options: categories.map((value) => ({ value, label: value })), value: ({ entry }) => entry.category },
      },
      cell: ({ row: { original: { entry } } }) => entry.category,
    },
    {
      id: "competence",
      header: "Competência",
      accessorFn: ({ entry }) => entry.competence,
      meta: {
        label: "Competência",
        hideBelow: "lg",
        className: "text-muted-foreground",
        filter: { kind: "select", label: "Competência", allLabel: "Todas", options: competences.map((value) => ({ value, label: competenceLabel(value) })), value: ({ entry }) => entry.competence },
      },
      cell: ({ row: { original: { entry } } }) => competenceLabel(entry.competence),
    },
    {
      id: "dueDate",
      header: "Vencimento",
      accessorFn: ({ entry }) => entry.dueDate,
      meta: {
        label: "Vencimento",
        hideBelow: "sm",
        className: "text-muted-foreground",
        filter: { kind: "date-range", label: "Vencimento", value: ({ entry }) => entry.dueDate },
      },
      cell: ({ row: { original: { entry } } }) => formatBirthDate(entry.dueDate),
    },
    {
      id: "amount",
      header: "Valor",
      accessorFn: ({ entry }) => entry.amountCents,
      meta: { label: "Valor", align: "right", className: "tabular-nums", filter: { kind: "money", label: "Valor", value: ({ entry }) => entry.amountCents } },
      cell: ({ row: { original: { entry } } }) => formatCurrency(entry.amountCents),
    },
    {
      id: "paid",
      header: "Pago",
      accessorFn: ({ paidCents }) => paidCents,
      meta: { label: "Pago", align: "right", hideBelow: "lg", className: "text-muted-foreground tabular-nums" },
      cell: ({ row: { original: { paidCents } } }) => formatCurrency(paidCents),
    },
    {
      id: "balance",
      header: "Saldo",
      accessorFn: ({ balanceCents }) => balanceCents,
      meta: { label: "Saldo", align: "right", hideBelow: "md", className: "text-muted-foreground tabular-nums" },
      cell: ({ row: { original: { balanceCents, status } } }) => (status === "cancelled" ? "—" : formatCurrency(balanceCents)),
    },
    {
      id: "method",
      header: "Pagamento",
      accessorFn: ({ methods }) => methods.map((method) => METHOD_LABELS[method]).join(", "),
      enableSorting: false,
      meta: {
        label: "Pagamento",
        hideBelow: "xl",
        className: "text-muted-foreground",
        filter: { kind: "multiselect", label: "Forma de pagamento", options: METHOD_OPTIONS, value: ({ methods }) => methods },
      },
      cell: ({ row: { original: { methods } } }) => (methods.length ? methods.map((method) => METHOD_LABELS[method]).join(", ") : "—"),
    },
    {
      id: "status",
      header: "Situação",
      accessorFn: ({ status }) => ENTRY_STATUS_LABELS[status],
      meta: { label: "Situação", align: "right", filter: { kind: "status", label: "Situação", options: STATUS_OPTIONS, value: ({ status }) => status } },
      cell: ({ row: { original: { status } } }) => <EntryStatusPill status={status} />,
    },
  ]
}
