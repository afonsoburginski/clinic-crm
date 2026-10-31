"use client"

import { Plus, Wallet } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { clinicDateKey } from "@/domain/clinic-time"
import type { FinancialEntry } from "@/domain/types"
import { useCan } from "@/shared/lib/current-user"
import { useUrlDialog, useUrlDialogGate } from "@/shared/lib/use-url-dialog"
import { DataTable, type DataTableState } from "@/shared/ui/data-table"
import { withFilter } from "@/shared/ui/data-table/lib/filters"
import type { DateRangeValue } from "@/shared/ui/date-range-picker"
import { FormDialogLoader } from "@/shared/ui/molecules/form-dialog"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { defaultFinancialState, FILTER_COLUMNS, filtersFromState, searchParamsFromState } from "../lib/filters"
import { financialActions } from "../lib/financial-actions"
import { useCancelEntryRow, useFinancialEntry, useFinancialReport, useFinancialSearch } from "../queries"
import { DistributionChart } from "./distribution-chart"
import { EntryDetailDialog } from "./entry-detail-dialog"
import { EntryFormDialog } from "./entry-form-dialog"
import { ExportXlsxButton } from "./export-xlsx-button"
import { FinancialFilterBar } from "./financial-filter-bar"
import { financialColumns } from "./financial-columns"
import { FinancialStatTiles } from "./financial-stat-tiles"
import { RevenueExpenseChart } from "./revenue-expense-chart"

/**
 * Um estado de filtros (`DataTableState`, vindo da toolbar e da barra de período) alimenta indicadores, gráficos,
 * tabela e exportação. Cada bloco busca, carrega e falha sozinho (RF-FIN-009).
 */
export function FinancialView() {
  const today = useMemo(() => clinicDateKey(new Date()), [])
  const defaultState = useMemo(() => defaultFinancialState(today), [today])
  const [tableState, setTableState] = useState<DataTableState>(defaultState)
  const [detailId, setDetailId] = useState<string | null>(null)
  const canWrite = useCan("finance:write")
  const novo = useUrlDialog("novo")
  const editar = useUrlDialog("editar")
  const creating = useUrlDialogGate(novo, canWrite)
  const editingId = useUrlDialogGate(editar, canWrite) ? editar.value : null
  const [template, setTemplate] = useState<FinancialEntry | null>(null)
  const cancelEntry = useCancelEntryRow()

  const filters = useMemo(() => filtersFromState(tableState), [tableState])
  const params = useMemo(() => searchParamsFromState(tableState), [tableState])
  const report = useFinancialReport(filters)
  const search = useFinancialSearch(filters, params)

  const facets = report.data?.facets
  const columns = useMemo(() => financialColumns({ categories: facets?.categories ?? [], competences: facets?.competences ?? [] }), [facets])

  const setPeriod = (period: DateRangeValue) =>
    setTableState((state) => ({ ...state, filters: withFilter(state.filters, FILTER_COLUMNS.period, period), pageIndex: 0 }))
  const clearFilters = () => setTableState((state) => ({ ...state, filters: {}, search: "", pageIndex: 0 }))

  const newEntry = (
    <PermissionGate permission="finance:write">
      <Button onClick={() => novo.open()}>
        <Plus aria-hidden />
        Novo lançamento
      </Button>
    </PermissionGate>
  )

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Receitas e despesas por vencimento, com pagamentos registrados à parte. Sem dados clínicos."
        actions={
          <>
            <ExportXlsxButton filters={filters} />
            {newEntry}
          </>
        }
      />

      <FinancialFilterBar
        period={tableState.filters[FILTER_COLUMNS.period] as DateRangeValue | undefined}
        filters={filters}
        total={report.data?.indicators.entryCount}
        onPeriodChange={setPeriod}
        onClear={clearFilters}
      />

      <FinancialStatTiles report={report.data} isLoading={report.isLoading} error={report.error} onRetry={() => report.refetch()} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueExpenseChart report={report.data} isLoading={report.isLoading} error={report.error} onRetry={() => report.refetch()} />
        <DistributionChart report={report.data} isLoading={report.isLoading} error={report.error} onRetry={() => report.refetch()} />
      </div>

      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Lançamentos"
          tableKey="financial-entries"
          mode="server"
          columns={columns}
          data={search.data?.items ?? []}
          total={search.data?.total ?? 0}
          getRowId={({ entry }) => entry.id}
          state={tableState}
          onStateChange={setTableState}
          defaultState={defaultState}
          searchPlaceholder="Código, descrição, categoria ou contraparte"
          isLoading={search.isLoading}
          isRefreshing={search.isPlaceholderData}
          error={search.error}
          onRetry={() => search.refetch()}
          noun={["lançamento", "lançamentos"]}
          empty={{
            icon: <Wallet aria-hidden />,
            title: "Nenhum lançamento",
            description: "Ainda não há lançamentos financeiros nesta clínica.",
            action: newEntry,
          }}
          onRowClick={({ entry }) => setDetailId(entry.id)}
          rowLabel={({ entry }) => entry.description}
          rowActions={(row) =>
            financialActions(row, {
              onView: () => setDetailId(row.entry.id),
              onPay: () => setDetailId(row.entry.id),
              onEdit: () => editar.open(row.entry.id),
              onDuplicate: () => setTemplate(row.entry),
              onCancel: (reason) => cancelEntry.mutate({ id: row.entry.id, input: { reason } }),
            })
          }
        />
      </SectionCard>

      {detailId && (
        <EntryDetailDialog
          entryId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null)
            editar.open(detailId)
          }}
        />
      )}
      {template && <EntryFormDialog template={template} defaultCompetence={filters.competence ?? today.slice(0, 7)} onClose={() => setTemplate(null)} />}
      {creating && <EntryFormDialog defaultCompetence={filters.competence ?? today.slice(0, 7)} onClose={novo.close} />}
      {editingId && <EntryEditDialog id={editingId} defaultCompetence={filters.competence ?? today.slice(0, 7)} onClose={editar.close} />}
    </>
  )
}

/** `?editar=<id>`: a tabela é paginada no servidor, então o lançamento é buscado pelo id (carregando/erro no próprio dialog). */
function EntryEditDialog({ id, defaultCompetence, onClose }: { id: string; defaultCompetence: string; onClose: () => void }) {
  const { data, error, refetch } = useFinancialEntry(id)
  return (
    <FormDialogLoader title="Editar lançamento" state={{ data: data?.entry, error, refetch }} onClose={onClose}>
      {(entry) => <EntryFormDialog key={entry.id} entry={entry} defaultCompetence={defaultCompetence} onClose={onClose} />}
    </FormDialogLoader>
  )
}
