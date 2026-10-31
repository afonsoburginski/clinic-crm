"use client"

import { Plus, Wallet } from "lucide-react"
import { useDeferredValue, useState } from "react"

import { Button } from "@/components/ui/button"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { clinicDateKey } from "@/domain/clinic-time"
import { ENTRY_STATUS_LABELS, KIND_LABELS, type KindSummary } from "@/domain/financial"
import type { FinancialEntry, FinancialEntryStatus, FinancialKind } from "@/domain/types"
import { formatBirthDate, formatCurrency } from "@/shared/lib/format"
import { DemoNotice } from "@/shared/ui/molecules/demo-notice"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SearchInput } from "@/shared/ui/molecules/search-input"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

import { useFinancialEntries, useFinancialSummary } from "../queries"
import { EntryDetailDialog } from "./entry-detail-dialog"
import { EntryFormDialog } from "./entry-form-dialog"
import { competenceLabel, EntryStatusPill } from "./entry-status-pill"

const KIND_FILTERS: { value: FinancialKind | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "income", label: "Receitas" },
  { value: "expense", label: "Despesas" },
]

const STATUS_OPTIONS = [
  { value: "all", label: "Todas as situações" },
  ...(Object.keys(ENTRY_STATUS_LABELS) as FinancialEntryStatus[]).map((value) => ({ value, label: ENTRY_STATUS_LABELS[value] })),
]

export function FinancialView() {
  const [competence, setCompetence] = useState(() => clinicDateKey(new Date()).slice(0, 7))
  const [kind, setKind] = useState<FinancialKind | "all">("all")
  const [status, setStatus] = useState<FinancialEntryStatus | "all">("all")
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<FinancialEntry | "new" | null>(null)

  const list = useFinancialEntries({ competence, kind, status, search: deferredSearch })
  const summary = useFinancialSummary(competence)

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
      <DemoNotice>Interface de demonstração: lançamentos e pagamentos ficam só neste navegador (localStorage). Os totais abaixo vêm apenas do que foi lançado aqui.</DemoNotice>

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
        <Toolbar label="Filtros de lançamentos">
          <ToolbarGroup className="w-full sm:max-w-xs">
            <SearchInput value={search} onChange={setSearch} placeholder="Código, descrição ou categoria" label="Buscar lançamentos" />
          </ToolbarGroup>
          <ToolbarGroup align="end">
            <HaloToggleGroup items={KIND_FILTERS} value={kind} onValueChange={(v) => v && setKind(v as FinancialKind | "all")} />
            <SimpleSelect ariaLabel="Filtrar por situação" value={status} onChange={(v) => setStatus(v as FinancialEntryStatus | "all")} options={STATUS_OPTIONS} className="w-48" />
          </ToolbarGroup>
        </Toolbar>

        {list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} className="m-4" />
        ) : list.isLoading ? (
          <ListSkeleton rows={6} className="p-4" />
        ) : !list.data?.length ? (
          <EmptyState icon={<Wallet aria-hidden />} title="Nenhum lançamento" description="Não há lançamentos nesta competência com os filtros atuais." className="m-4" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Lançamento</TableHead>
                <TableHead className="hidden sm:table-cell">Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="hidden text-right md:table-cell">Saldo</TableHead>
                <TableHead className="pr-5 text-right">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map(({ entry, balanceCents, status: rowStatus }) => (
                <TableRow
                  key={entry.id}
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => setDetailId(entry.id)}
                  onKeyDown={(e) => e.key === "Enter" && setDetailId(entry.id)}
                >
                  <TableCell className="pl-5">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{entry.description}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{entry.code}</span> · {KIND_LABELS[entry.kind]} · {entry.category}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{formatBirthDate(entry.dueDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(entry.amountCents)}</TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">{rowStatus === "cancelled" ? "—" : formatCurrency(balanceCents)}</TableCell>
                  <TableCell className="pr-5 text-right">
                    <EntryStatusPill status={rowStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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
