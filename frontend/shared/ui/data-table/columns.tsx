import type { DataTableColumn } from "./data-table"

/**
 * Coluna de ações da linha (botões editar, redefinir…): sem ordenação, sempre visível, alinhada à direita.
 * Não confundir com `rowActions` do DataTable, que gera o menu "⋯"/clique direito compartilhado.
 */
export function actionsColumn<T>(render: (row: T) => React.ReactNode, { id = "actions", label = "Ações" }: { id?: string; label?: string } = {}): DataTableColumn<T> {
  return {
    id,
    header: () => <span className="sr-only">{label}</span>,
    cell: ({ row }) => <div className="flex justify-end gap-1">{render(row.original)}</div>,
    enableSorting: false,
    enableHiding: false,
    meta: { label, alwaysVisible: true, align: "right" },
  }
}
