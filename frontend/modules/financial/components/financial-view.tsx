"use client"

import { Plus, Wallet } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { clinicDateKey } from "@/domain/clinic-time"
import { ENTRY_STATUS_LABELS, KIND_LABELS, type KindSummary } from "@/domain/financial"
import type { FinancialEntry, FinancialEntryStatus, FinancialKind } from "@/domain/types"
import { formatBirthDate, formatCurrency } from "@/shared/lib/format"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { ErrorState } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"
import type { FinancialRow } from "@/shared/api/api"

import { useFinancialEntries, useFinancialSummary } from "../queries"
import { EntryDetailDialog } from "./entry-detail-dialog"
import { EntryFormDialog } from "./entry-form-dialog"
import { competenceLabel, EntryStatusPill } from "./entry-status-pill"

const KIND_OPTIONS = (Object.keys(KIND_LABELS) as FinancialKind[]).map((value) => ({ value, label: KIND_LABELS[value] }))
const STATUS_OPTIONS = (Object.keys(ENTRY_STATUS_LABELS) as FinancialEntryStatus[]).map((value) => ({ value, label: ENTRY_STATUS_LABELS[value] }))

export function FinancialView() {
  const [competence, setCompetence] = useState(() => clinicDateKey(new Date()).slice(0, 7))
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<FinancialEntry | "new" | null>(null)

  const list = useFinancialEntries({ competence })
  const summary = useFinancialSummary(competence)

  const columns = useMemo<DataTableColumn<FinancialRow>[]>(() => {
    const categories = [...new Set((list.data ?? []).map(({ entry }) => entry.category).filter(Boolean))].sort((x, y) => x.localeCompare(y, "pt-BR"))
    return [
      {
        id: "description",
        header: "Lançamento",
        accessorFn: ({ entry }) => entry.description,
        meta: {
          label: "Lançamento",
          alwaysVisible: true,
          searchValue: ({ entry }) => `${entry.code} ${entry.description} ${entry.category} ${entry.counterparty ?? ""}`,
          exportValue: ({ entry }) => entry.description,
        },
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
        meta: { label: "Tipo", hideBelow: "md", filter: { kind: "status", label: "Tipo", options: KIND_OPTIONS, value: ({ entry }) => entry.kind }, exportValue: ({ entry }) => KIND_LABELS[entry.kind] },
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
          exportValue: ({ entry }) => entry.category,
        },
        cell: ({ row: { original: { entry } } }) => entry.category,
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
          exportValue: ({ entry }) => entry.dueDate,
        },
        cell: ({ row: { original: { entry } } }) => formatBirthDate(entry.dueDate),
      },
      {
        id: "amount",
        header: "Valor",
        accessorFn: ({ entry }) => entry.amountCents,
        meta: { label: "Valor", align: "right", className: "tabular-nums", filter: { kind: "money", label: "Valor", value: ({ entry }) => entry.amountCents }, exportValue: ({ entry }) => entry.amountCents / 100 },
        cell: ({ row: { original: { entry } } }) => formatCurrency(entry.amountCents),
      },
      {
        id: "balance",
        header: "Saldo",
        accessorFn: ({ balanceCents }) => balanceCents,
        meta: { label: "Saldo", align: "right", hideBelow: "md", className: "text-muted-foreground tabular-nums", exportValue: ({ balanceCents }) => balanceCents / 100 },
        cell: ({ row: { original: { balanceCents, status } } }) => (status === "cancelled" ? "—" : formatCurrency(balanceCents)),
      },
      {
        id: "status",
        header: "Situação",
        accessorFn: ({ status }) => ENTRY_STATUS_LABELS[status],
        meta: { label: "Situação", align: "right", filter: { kind: "status", label: "Situação", options: STATUS_OPTIONS, value: ({ status }) => status }, exportValue: ({ status }) => ENTRY_STATUS_LABELS[status] },
        cell: ({ row: { original: { status } } }) => <EntryStatusPill status={status} />,
      },
    ]
  }, [list.data])

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Receitas e despesas por competência e vencimento, com pagamentos registrados à parte. Sem dados clínicos."
        actions={
          <PermissionGate permission="finance:write">
            <Button onClick={() => setEditing("new")}>
              <Plus aria-hidden />
              Novo lançamento
            </Button>
          </PermissionGate>
        }
      />

      <Toolbar variant="bar" label="Competência">
        <ToolbarGroup>
          <label htmlFor="fin-competence" className="text-sm font-medium">
            Competência
          </label>
          <Input id="fin-competence" type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} className="w-44" />
          <p className="text-sm text-muted-foreground">{/^\d{4}-\d{2}$/.test(competence) ? competenceLabel(competence) : "Informe uma competência válida"}</p>
        </ToolbarGroup>
      </Toolbar>

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3" aria-busy={summary.isLoading}>
          <KindCard title="Receitas" settledLabel="Recebido" data={summary.data?.income} />
          <KindCard title="Despesas" settledLabel="Pago" data={summary.data?.expense} />
          <SectionCard title="Resultado realizado">
            <p className="text-2xl font-semibold tabular-nums">{summary.data ? formatCurrency(summary.data.realizedResultCents) : "—"}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Receita recebida menos despesa paga, só do que foi baixado na competência.</p>
          </SectionCard>
        </div>
      )}

      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Lançamentos"
          tableKey="financial-entries"
          columns={columns}
          data={list.data ?? []}
          getRowId={({ entry }) => entry.id}
          defaultState={{ sort: [{ id: "dueDate", desc: false }] }}
          searchPlaceholder="Código, descrição ou categoria"
          isLoading={list.isLoading}
          isRefreshing={list.isPlaceholderData}
          error={list.error}
          onRetry={() => list.refetch()}
          noun={["lançamento", "lançamentos"]}
          empty={{ icon: <Wallet aria-hidden />, title: "Nenhum lançamento", description: "Não há lançamentos nesta competência." }}
          onRowClick={({ entry }) => setDetailId(entry.id)}
        />
      </SectionCard>

      {detailId && (
        <EntryDetailDialog
          entryId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            const row = list.data?.find((r) => r.entry.id === detailId)
            if (row) {
              setDetailId(null)
              setEditing(row.entry)
            }
          }}
        />
      )}
      {editing && <EntryFormDialog entry={editing === "new" ? undefined : editing} defaultCompetence={competence} onClose={() => setEditing(null)} />}
    </>
  )
}

function KindCard({ title, settledLabel, data }: { title: string; settledLabel: string; data?: KindSummary }) {
  return (
    <SectionCard title={title} description={data ? (data.count ? `${data.count} lançamento${data.count === 1 ? "" : "s"}` : "Sem lançamentos na competência") : undefined}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Figure label="Previsto" cents={data?.expectedCents} />
        <Figure label={settledLabel} cents={data?.settledCents} />
        <Figure label="Em aberto" cents={data?.openCents} />
        <Figure label="Vencido" cents={data?.overdueCents} />
      </dl>
    </SectionCard>
  )
}

function Figure({ label, cents }: { label: string; cents?: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{cents === undefined ? "—" : formatCurrency(cents)}</dd>
    </div>
  )
}
