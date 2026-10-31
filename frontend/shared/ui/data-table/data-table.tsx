"use client"

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type Header,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown, SearchX } from "lucide-react"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { EntityActionsButton, EntityContextMenu, EntityMenu } from "@/shared/ui/entity-menu"
import type { EntityAction } from "@/shared/ui/entity-menu"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"

import "./column-meta"
import { DataTableColumnsMenu, type ColumnMenuItem } from "./data-table-columns-menu"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableToolbar } from "./data-table-toolbar"
import { DataTableViews } from "./data-table-views"
import { columnActions, focusFilterControl } from "./lib/column-actions"
import { activeFilters, applyFilters, facetCounts, withFilter } from "./lib/filters"
import { clampPage, pageCountOf } from "./lib/pagination"
import { compareValues } from "./lib/sort"
import { emptyState, type DataTableState, type FilterSpec, type FilterValue } from "./lib/types"
import { DEFAULT_VIEW, applyView, defaultsOf, resolveInitialState, viewPayload, workingChanged, workingPayload } from "./lib/views"
import { useDeleteTableView, useSaveTableView, useTablePreferences } from "./preferences"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<T> = ColumnDef<T, any>

const SELECT_ID = "__select"
const EXPAND_ID = "__expand"
const ACTIONS_ID = "__actions"
const AUTOSAVE_DELAY_MS = 800

/** Coluna "⋯": fixa à direita (opaca, acompanha o realce da linha) para continuar à mão em tabelas largas. */
const STICKY_ACTIONS_CLASS =
  "sticky right-0 z-10 bg-background group-hover/row:bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))] group-data-[state=selected]/row:bg-muted group-data-popup-open/row:bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))]"
const STICKY_HEAD_CLASS = "sticky right-0 z-10 bg-background"

const BREAKPOINT_CLASS = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
} as const

export function columnIdOf<T>(column: DataTableColumn<T>): string | undefined {
  if (column.id) return column.id
  return "accessorKey" in column && typeof column.accessorKey === "string" ? column.accessorKey : undefined
}

const resolve = <S,>(updater: Updater<S>, previous: S): S => (typeof updater === "function" ? (updater as (old: S) => S)(previous) : updater)

/** Texto da busca global: `meta.searchValue` das colunas; sem ele, o valor do acessor quando for texto ou número. */
function searchTextOf<T>(columns: readonly DataTableColumn<T>[]) {
  const parts = columns.flatMap((column) => {
    const custom = column.meta?.searchValue
    if (custom) return [custom]
    const read = (row: T): unknown => {
      if ("accessorFn" in column && column.accessorFn) return column.accessorFn(row, 0)
      if ("accessorKey" in column && typeof column.accessorKey === "string") return (row as Record<string, unknown>)[column.accessorKey]
      return undefined
    }
    return [(row: T) => {
      const value = read(row)
      return typeof value === "string" || typeof value === "number" ? String(value) : ""
    }]
  })
  return (row: T) => parts.map((part) => part(row)).join(" ")
}

/** O que a tabela entrega a `rowActions` além da linha: o estado de expansão (linhas expansíveis, ex.: auditoria). */
export interface RowActionHelpers {
  expanded: boolean
  toggleExpanded: () => void
}

export interface DataTableProps<T> {
  /** Nome acessível da tabela e rótulo da toolbar (ex.: "Pacientes"). */
  label: string
  columns: DataTableColumn<T>[]
  data: T[]
  getRowId: (row: T) => string
  /** Liga as visões salvas e as preferências do usuário (API/PostgreSQL). Sem ela a tabela só guarda estado em memória. */
  tableKey?: string
  /** `client` (padrão): busca, filtro, ordenação e paginação em memória. `server`: o pai busca; use `total` e `state`. */
  mode?: "client" | "server"
  /** Modo `server`: total de linhas do servidor (a página atual vem em `data`). */
  total?: number
  /** Estado controlado (modo `server` ou quando o pai precisa dele); sem isso a tabela guarda o próprio. */
  state?: DataTableState
  onStateChange?: (state: DataTableState) => void
  /** Estado inicial da tela: filtros, ordenação, tamanho da página e colunas ocultas padrão. */
  defaultState?: Partial<DataTableState>
  searchPlaceholder?: string
  /** Texto da busca global por linha; o padrão usa as colunas (`meta.searchValue` ou valores de texto). */
  searchText?: (row: T) => string
  isLoading?: boolean
  /** Dados antigos ainda na tela enquanto uma nova consulta carrega. */
  isRefreshing?: boolean
  error?: unknown
  onRetry?: () => void
  /** Estado vazio (sem nenhum registro, antes de qualquer filtro). */
  empty?: { title: string; description?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode }
  noun?: [string, string]
  onRowClick?: (row: T) => void
  enableRowSelection?: boolean
  onSelectionChange?: (rows: T[]) => void
  /** Todas as linhas que passam por busca e filtros, já ordenadas (todas as páginas): base da exportação. Passe uma função estável (ex.: o setter de um `useState`). */
  onRowsChange?: (rows: T[]) => void
  /** Ações da tela na toolbar (ex.: exportar), à esquerda de Colunas e Visões. */
  toolbarActions?: React.ReactNode
  /** Linha expansível (ex.: detalhes de auditoria): ganha uma coluna com o botão de expandir. */
  renderExpanded?: (row: T) => React.ReactNode
  /**
   * Ações de cada linha (`EntityAction[]`): viram a coluna final "⋯" (fixa à direita) e o menu de clique direito da
   * `<tr>` — Shift+F10 / tecla Menu abrem o mesmo menu a partir do foco. Fora da exportação e da ordenação.
   */
  rowActions?: (row: T, helpers: RowActionHelpers) => EntityAction[]
  /** Nome acessível do botão "⋯" de uma linha (ex.: "Ações de Maria Souza"). */
  rowLabel?: (row: T) => string
  /** Menu de cada cabeçalho (clique direito e "⋯"): ordenar, ocultar, filtrar, mostrar todas. Ligado por padrão. */
  headerMenu?: boolean
  className?: string
}

export function DataTable<T>({
  label,
  columns,
  data,
  getRowId,
  tableKey,
  mode = "client",
  total,
  state: controlledState,
  onStateChange,
  defaultState,
  searchPlaceholder = "Buscar…",
  searchText,
  isLoading,
  isRefreshing,
  error,
  onRetry,
  empty,
  noun,
  onRowClick,
  enableRowSelection,
  onSelectionChange,
  onRowsChange,
  toolbarActions,
  renderExpanded,
  rowActions,
  rowLabel,
  headerMenu = true,
  className,
}: DataTableProps<T>) {
  const server = mode === "server"
  const rootRef = useRef<HTMLDivElement>(null)
  // As telas passam `rowLabel` inline: ler pela ref evita refazer as colunas do TanStack a cada render.
  const rowLabelRef = useRef(rowLabel)
  rowLabelRef.current = rowLabel
  const hasRowActions = !!rowActions
  const defaults = useMemo(() => defaultsOf(defaultState), []) // eslint-disable-line react-hooks/exhaustive-deps -- padrão da tela, fixo na montagem

  // ---------------------------------------------------------------- estado (próprio ou controlado)
  const [localState, setLocalState] = useState<DataTableState>(defaults)
  const state = controlledState ?? localState
  const stateRef = useRef(state)
  stateRef.current = state
  const onStateChangeRef = useRef(onStateChange)
  onStateChangeRef.current = onStateChange
  const setState = useCallback((patch: Partial<DataTableState>) => {
    const next = { ...stateRef.current, ...patch }
    stateRef.current = next
    setLocalState(next)
    onStateChangeRef.current?.(next)
  }, [])

  // ---------------------------------------------------------------- colunas, filtros e busca
  const userColumnIds = useMemo(() => columns.flatMap((column) => columnIdOf(column) ?? []), [columns])
  const specs = useMemo<FilterSpec<T>[]>(
    () =>
      columns.flatMap((column) => {
        const id = columnIdOf(column)
        return id && column.meta?.filter ? [{ id, config: column.meta.filter }] : []
      }),
    [columns]
  )
  const getSearchText = useMemo(() => searchText ?? searchTextOf(columns), [searchText, columns])
  const viewContext = useMemo(() => ({ columnIds: userColumnIds, specs }), [userColumnIds, specs])

  const filtered = useMemo(
    () => (server ? data : applyFilters(data, specs, state.filters, state.search, { searchText: getSearchText })),
    [server, data, specs, state.filters, state.search, getSearchText]
  )
  const counts = useMemo(() => {
    if (server) return {}
    return Object.fromEntries(specs.map((spec) => [spec.id, facetCounts(data, specs, spec.id, state.filters, state.search, getSearchText)]))
  }, [server, data, specs, state.filters, state.search, getSearchText])

  // ---------------------------------------------------------------- preferências e visões salvas (API)
  const prefs = useTablePreferences(tableKey)
  const saveView = useSaveTableView(tableKey)
  const deleteView = useDeleteTableView(tableKey)
  const [hydrated, setHydrated] = useState(!tableKey)
  const lastSaved = useRef<DataTableState>(state)

  useEffect(() => {
    if (hydrated || !tableKey || prefs.isPending) return
    // Falha de rede não quebra a tabela: segue com o padrão da tela.
    const resolved = prefs.data ? resolveInitialState(prefs.data, stateRef.current, viewContext) : stateRef.current
    lastSaved.current = resolved
    setHydrated(true)
    if (resolved !== stateRef.current) setState(resolved)
  }, [hydrated, tableKey, prefs.isPending, prefs.data, viewContext, setState])

  useEffect(() => {
    if (!tableKey || !hydrated || !workingChanged(state, lastSaved.current)) return
    const snapshot = state
    const timer = setTimeout(() => {
      saveView.mutate({ name: DEFAULT_VIEW, input: workingPayload(snapshot), silent: true }, { onSuccess: () => (lastSaved.current = snapshot) })
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só as preferências de trabalho disparam a gravação
  }, [tableKey, hydrated, state.pageSize, state.sort, state.hiddenColumns, state.columnOrder])

  // ---------------------------------------------------------------- tabela (TanStack)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const sorting: SortingState = state.sort
  const totalRows = server ? (total ?? data.length) : filtered.length
  const pageCount = pageCountOf(totalRows, state.pageSize)
  const pageIndex = clampPage(state.pageIndex, pageCount)
  // Só ajusta a página com os dados na tela: durante o carregamento o total ainda é desconhecido.
  const settled = !isLoading && !isRefreshing && hydrated
  useEffect(() => {
    if (settled && pageIndex !== state.pageIndex) setState({ pageIndex })
  }, [settled, pageIndex, state.pageIndex, setState])

  const orderedUserIds = useMemo(
    () => [...state.columnOrder.filter((id) => userColumnIds.includes(id)), ...userColumnIds.filter((id) => !state.columnOrder.includes(id))],
    [state.columnOrder, userColumnIds]
  )

  const allColumns = useMemo<DataTableColumn<T>[]>(() => {
    const select: DataTableColumn<T> = {
      id: SELECT_ID,
      header: ({ table }) => (
        <Checkbox
          aria-label="Selecionar todas as linhas da página"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
        />
      ),
      cell: ({ row }) => (
        <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <Checkbox aria-label="Selecionar linha" checked={row.getIsSelected()} onCheckedChange={(checked) => row.toggleSelected(checked === true)} />
        </span>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { alwaysVisible: true, className: "w-10" },
    }
    const expand: DataTableColumn<T> = {
      id: EXPAND_ID,
      header: () => <span className="sr-only">Detalhes</span>,
      cell: ({ row }) => (
        <button
          type="button"
          aria-expanded={!!expanded[row.id]}
          aria-label={expanded[row.id] ? "Recolher detalhes" : "Expandir detalhes"}
          onClick={(event) => {
            event.stopPropagation()
            setExpanded((current) => ({ ...current, [row.id]: !current[row.id] }))
          }}
          className="inline-flex size-6 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={cn("size-4 transition-transform", expanded[row.id] && "rotate-90")} aria-hidden />
        </button>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { alwaysVisible: true, className: "w-10" },
    }
    const actions: DataTableColumn<T> = {
      id: ACTIONS_ID,
      header: () => <span className="sr-only">Ações</span>,
      cell: ({ row }) => (
        <span className="flex justify-end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <EntityActionsButton label={rowLabelRef.current ? `Ações de ${rowLabelRef.current(row.original)}` : "Ações da linha"} />
        </span>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { alwaysVisible: true, align: "right", className: `w-12 ${STICKY_ACTIONS_CLASS}`, headerClassName: STICKY_HEAD_CLASS },
    }
    const byId = new Map(columns.map((column) => [columnIdOf(column), column]))
    const ordered = orderedUserIds.flatMap((id) => byId.get(id) ?? [])
    const unnamed = columns.filter((column) => !columnIdOf(column))
    return [...(enableRowSelection ? [select] : []), ...(renderExpanded ? [expand] : []), ...ordered, ...unnamed, ...(hasRowActions ? [actions] : [])]
  }, [columns, orderedUserIds, enableRowSelection, renderExpanded, hasRowActions, expanded])

  const columnVisibility = useMemo(() => Object.fromEntries(state.hiddenColumns.map((id) => [id, false])), [state.hiddenColumns])

  const table = useReactTable({
    data: server ? data : filtered,
    columns: allColumns,
    getRowId,
    state: { sorting, columnVisibility, rowSelection, pagination: { pageIndex, pageSize: state.pageSize } },
    onSortingChange: (updater) => setState({ sort: resolve(updater, sorting), pageIndex: 0 }),
    onRowSelectionChange: setRowSelection,
    defaultColumn: { sortingFn: (a, b, columnId) => compareValues(a.getValue(columnId), b.getValue(columnId)) },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: server ? undefined : getSortedRowModel(),
    getPaginationRowModel: server ? undefined : getPaginationRowModel(),
    manualSorting: server,
    manualPagination: server,
    pageCount,
    enableRowSelection: !!enableRowSelection,
    enableMultiSort: true,
    autoResetPageIndex: false,
  })

  const preRows = table.getPrePaginationRowModel().rows
  useEffect(() => onRowsChange?.(preRows.map((row) => row.original)), [preRows, onRowsChange])
  useEffect(() => {
    if (!onSelectionChange) return
    const selected = new Set(Object.keys(rowSelection).filter((id) => rowSelection[id]))
    onSelectionChange(data.filter((row) => selected.has(getRowId(row))))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a seleção dispara
  }, [rowSelection])

  // ---------------------------------------------------------------- ações da toolbar
  const changeFilter = (id: string, value: FilterValue | undefined) => setState({ filters: withFilter(state.filters, id, value), pageIndex: 0 })
  const clearAll = () => setState({ filters: {}, search: "", pageIndex: 0 })
  const resetColumns = () => setState({ hiddenColumns: defaults.hiddenColumns, columnOrder: defaults.columnOrder, sort: defaults.sort, pageSize: defaults.pageSize, pageIndex: 0 })

  const columnItems: ColumnMenuItem[] = orderedUserIds.flatMap((id) => {
    const column = table.getColumn(id)
    if (!column) return []
    const header = column.columnDef.header
    return [
      {
        id,
        label: column.columnDef.meta?.label ?? (typeof header === "string" ? header : id),
        visible: !state.hiddenColumns.includes(id),
        locked: !!column.columnDef.meta?.alwaysVisible,
      },
    ]
  })
  const moveColumn = (id: string, direction: -1 | 1) => {
    const order = [...orderedUserIds]
    const from = order.indexOf(id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= order.length) return
    ;[order[from], order[to]] = [order[to], order[from]]
    setState({ columnOrder: order })
  }
  const toggleColumn = (id: string) =>
    setState({ hiddenColumns: state.hiddenColumns.includes(id) ? state.hiddenColumns.filter((h) => h !== id) : [...state.hiddenColumns, id] })

  const sortColumn = (id: string, direction: "asc" | "desc" | false) =>
    setState({ sort: direction ? [{ id, desc: direction === "desc" }] : state.sort.filter((rule) => rule.id !== id), pageIndex: 0 })
  const hideColumn = (id: string) => !state.hiddenColumns.includes(id) && setState({ hiddenColumns: [...state.hiddenColumns, id] })
  const showAllColumns = () => setState({ hiddenColumns: [] })

  const savedViews = (prefs.data ?? []).filter((view) => view.name !== DEFAULT_VIEW)
  const anyFilter = activeFilters(specs, state.filters).length > 0 || state.search.trim() !== ""
  const busy = isLoading || !hydrated

  // ---------------------------------------------------------------- render
  const visibleLeaf = table.getVisibleLeafColumns()
  const edgeClass = (id: string) => (id === visibleLeaf[0]?.id ? "pl-5" : id === visibleLeaf[visibleLeaf.length - 1]?.id ? "pr-5" : undefined)
  const cellClass = (column: Column<T, unknown>) => {
    const meta = column.columnDef.meta
    return cn(
      meta?.align === "right" && "text-right",
      meta?.align === "center" && "text-center",
      meta?.hideBelow && BREAKPOINT_CLASS[meta.hideBelow],
      edgeClass(column.id),
      meta?.className
    )
  }

  const renderRow = (row: Row<T>) => {
    const rowProps = {
      "data-state": row.getIsSelected() ? ("selected" as const) : undefined,
      tabIndex: onRowClick ? 0 : undefined,
      className: cn("group/row", onRowClick && "cursor-pointer"),
      onClick: onRowClick ? () => onRowClick(row.original) : undefined,
      onKeyDown: onRowClick
        ? (event: React.KeyboardEvent) => {
            if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault()
              onRowClick(row.original)
            }
          }
        : undefined,
    }
    const cells = row.getVisibleCells().map((cell) => (
      <TableCell key={cell.id} className={cn("py-3", cellClass(cell.column))}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </TableCell>
    ))
    const line = rowActions ? (
      <EntityMenu actions={rowActions(row.original, { expanded: !!expanded[row.id], toggleExpanded: () => setExpanded((current) => ({ ...current, [row.id]: !current[row.id] })) })}>
        <EntityContextMenu render={<TableRow {...rowProps} />}>{cells}</EntityContextMenu>
      </EntityMenu>
    ) : (
      <TableRow {...rowProps}>{cells}</TableRow>
    )
    return (
      <Fragment key={row.id}>
        {line}
        {renderExpanded && expanded[row.id] && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={visibleLeaf.length} className="p-0 whitespace-normal">
              {renderExpanded(row.original)}
            </TableCell>
          </TableRow>
        )}
      </Fragment>
    )
  }

  const renderHeader = (header: Header<T, unknown>) => {
    const column = header.column
    const sorted = column.getIsSorted()
    const canSort = column.getCanSort()
    const content = header.isPlaceholder ? null : flexRender(column.columnDef.header, header.getContext())
    const label = column.columnDef.meta?.label ?? (typeof column.columnDef.header === "string" ? column.columnDef.header : column.id)
    const headProps = {
      scope: "col" as const,
      "aria-sort": canSort ? (sorted === "asc" ? ("ascending" as const) : sorted === "desc" ? ("descending" as const) : ("none" as const)) : undefined,
      className: cn("group/th", cellClass(column), column.columnDef.meta?.headerClassName),
    }
    const inner = (
      <span className={cn("inline-flex items-center gap-1", column.columnDef.meta?.align === "right" && "flex-row-reverse")}>
        {canSort ? (
          <button
            type="button"
            onClick={column.getToggleSortingHandler()}
            title="Ordenar (Shift para ordenar por mais de uma coluna)"
            className="-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
            {sorted === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : sorted === "desc" ? <ArrowDown className="size-3.5" aria-hidden /> : <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />}
          </button>
        ) : (
          content
        )}
        {headerMenu && !header.isPlaceholder && userColumnIds.includes(column.id) && (
          <EntityActionsButton
            size="icon-xs"
            label={`Opções da coluna ${label}`}
            align="start"
            className="opacity-0 transition-opacity group-hover/th:opacity-100 group-focus-within/th:opacity-100 aria-expanded:opacity-100"
          />
        )}
      </span>
    )
    if (!headerMenu || header.isPlaceholder || !userColumnIds.includes(column.id)) {
      return (
        <TableHead key={header.id} {...headProps}>
          {inner}
        </TableHead>
      )
    }
    const actions = columnActions({
      label,
      canSort,
      sorted,
      canHide: !column.columnDef.meta?.alwaysVisible && column.getCanHide(),
      hasFilter: specs.some((spec) => spec.id === column.id),
      hiddenCount: state.hiddenColumns.length,
      onSort: (direction) => sortColumn(column.id, direction),
      onHide: () => hideColumn(column.id),
      onFilter: () => focusFilterControl(rootRef.current, column.id),
      onShowAll: showAllColumns,
    })
    return (
      <EntityMenu key={header.id} actions={actions}>
        <EntityContextMenu render={<TableHead {...headProps} />}>{inner}</EntityContextMenu>
      </EntityMenu>
    )
  }

  let body: React.ReactNode
  if (error) body = <ErrorState error={error} onRetry={onRetry} className="m-4" />
  else if (busy) body = <ListSkeleton rows={Math.min(state.pageSize, 8)} className="p-4" />
  else if (totalRows === 0 && !anyFilter) body = <EmptyState title={empty?.title ?? "Nenhum registro"} description={empty?.description} icon={empty?.icon} action={empty?.action} className="m-4" />
  else if (totalRows === 0)
    body = (
      <EmptyState
        icon={<SearchX aria-hidden />}
        title="Nenhum resultado"
        description="Nenhum registro corresponde à busca e aos filtros atuais."
        action={
          <Button variant="outline" onClick={clearAll}>
            Limpar filtros
          </Button>
        }
        className="m-4"
      />
    )
  else
    body = (
      <div className={cn("transition-opacity", isRefreshing && "opacity-60")}>
        <Table aria-label={label} aria-busy={isRefreshing || undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map(renderHeader)}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>{table.getRowModel().rows.map(renderRow)}</TableBody>
        </Table>
      </div>
    )

  return (
    <div ref={rootRef} data-slot="data-table" className={className}>
      <DataTableToolbar
        label={label}
        search={state.search}
        searchPlaceholder={searchPlaceholder}
        specs={specs}
        filters={state.filters}
        counts={counts}
        onSearchChange={(search) => setState({ search, pageIndex: 0 })}
        onFilterChange={changeFilter}
        onClear={clearAll}
        trailing={
          <>
            {toolbarActions}
            <DataTableColumnsMenu items={columnItems} onToggle={toggleColumn} onMove={moveColumn} onReset={resetColumns} />
            {tableKey && (
              <DataTableViews
                views={savedViews}
                isLoading={prefs.isPending}
                saving={saveView.isPending}
                deleting={deleteView.isPending}
                onApply={(view) => setState(applyView(state, view, viewContext))}
                onSave={(name, initial) => saveView.mutate({ name, input: viewPayload(state, initial) })}
                onToggleInitial={(view) =>
                  saveView.mutate({
                    name: view.name,
                    input: { pageSize: view.pageSize, sort: view.sort, hiddenColumns: view.hiddenColumns, columnOrder: view.columnOrder, filters: view.filters, isDefault: !view.isDefault },
                  })
                }
                onDelete={(name) => deleteView.mutate(name)}
                onReset={() => setState({ ...emptyState(defaults), pageIndex: 0 })}
              />
            )}
          </>
        }
      />
      {body}
      {!error && !busy && totalRows > 0 && (
        <DataTablePagination
          pageIndex={pageIndex}
          pageSize={state.pageSize}
          pageCount={pageCount}
          total={totalRows}
          noun={noun}
          onPageChange={(next) => setState({ pageIndex: next })}
          onPageSizeChange={(pageSize) => setState({ pageSize, pageIndex: 0 })}
        />
      )}
    </div>
  )
}

