"use client"

import { useMemo } from "react"

import type { AuditEntry } from "@/domain/types"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/shared/lib/format"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { auditActions } from "../lib/audit-actions"
import { useAuditLog } from "../queries"

const RESOURCE_LABELS: Record<string, string> = {
  patient: "Paciente",
  guardian: "Responsável",
  guardian_link: "Vínculo",
  appointment: "Agendamento",
  professional: "Profissional",
  unavailability: "Indisponibilidade",
  service: "Serviço",
  specialty: "Especialidade",
  room: "Sala",
  settings: "Configurações",
  user: "Usuário",
  role: "Papel",
}

const ACTION_LABELS: Record<string, string> = {
  create: "Criação",
  update: "Alteração",
  delete: "Remoção",
  status: "Status",
  status_change: "Situação",
  password_reset: "Senha redefinida",
}

const RESOURCE_OPTIONS = Object.entries(RESOURCE_LABELS).map(([value, label]) => ({ value, label }))
const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))

export function AuditView() {
  const query = useAuditLog({ resource: "all", actorId: "all" })
  const entries = query.data ?? []

  const columns = useMemo<DataTableColumn<AuditEntry>[]>(() => {
    const actors = new Map<string, string>()
    for (const e of entries) actors.set(e.actorId, e.actorName)
    return [
      {
        id: "at",
        header: "Quando",
        accessorFn: (e) => e.at,
        meta: { label: "Quando", filter: { kind: "date-range", label: "Período", value: (e) => e.at } },
        cell: ({ row: { original: e } }) => (
          <time dateTime={e.at} className="font-mono text-xs text-muted-foreground">
            {formatDateTime(e.at)}
          </time>
        ),
      },
      {
        id: "actor",
        header: "Pessoa",
        accessorFn: (e) => e.actorName,
        meta: {
          label: "Pessoa",
          searchValue: (e) => e.actorName,
          filter: { kind: "multiselect", label: "Pessoa", options: [...actors].map(([value, label]) => ({ value, label })), value: (e) => e.actorId },
        },
        cell: ({ row: { original: e } }) => (
          <span className="flex items-center gap-2.5">
            <PersonAvatar name={e.actorName} className="size-7" />
            <span className="font-medium">{e.actorName}</span>
          </span>
        ),
      },
      {
        id: "summary",
        header: "Evento",
        accessorFn: (e) => e.summary,
        meta: { label: "Evento", alwaysVisible: true, searchValue: (e) => e.summary },
        cell: ({ row: { original: e } }) => {
          const count = e.changes ? Object.keys(e.changes).length : 0
          return (
            <div className="flex min-w-0 flex-col">
              <span className="text-pretty">{e.summary}</span>
              {count > 0 && (
                <span className="text-xs text-muted-foreground">
                  {count} campo{count === 1 ? "" : "s"} alterado{count === 1 ? "" : "s"}
                </span>
              )}
            </div>
          )
        },
      },
      {
        id: "resource",
        header: "Recurso",
        accessorFn: (e) => RESOURCE_LABELS[e.resource] ?? e.resource,
        meta: {
          label: "Recurso",
          hideBelow: "md",
          filter: { kind: "multiselect", label: "Recurso", options: RESOURCE_OPTIONS, value: (e) => e.resource },
        },
        cell: ({ row: { original: e } }) => RESOURCE_LABELS[e.resource] ?? e.resource,
      },
      {
        id: "action",
        header: "Ação",
        accessorFn: (e) => ACTION_LABELS[e.action] ?? e.action,
        meta: {
          label: "Ação",
          hideBelow: "md",
          className: "text-muted-foreground",
          filter: { kind: "multiselect", label: "Ação", options: ACTION_OPTIONS, value: (e) => e.action },
        },
        cell: ({ row: { original: e } }) => ACTION_LABELS[e.action] ?? e.action,
      },
    ]
  }, [entries])

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Registro imutável de quem alterou o quê. Conteúdo clínico não aparece aqui — apenas o fato da alteração."
      />
      <SectionCard title="Eventos" bodyClassName="p-0">
        <DataTable
          label="Eventos de auditoria"
          tableKey="audit"
          columns={columns}
          data={entries}
          getRowId={(e) => e.id}
          defaultState={{ sort: [{ id: "at", desc: true }] }}
          searchPlaceholder="Pessoa ou evento"
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => query.refetch()}
          noun={["registro", "registros"]}
          empty={{ title: "Nenhum evento", description: "Faça uma alteração no sistema para ver o registro aqui." }}
          rowLabel={(e) => e.summary}
          rowActions={(e, { expanded, toggleExpanded }) => auditActions(e, { detailsOpen: expanded, onToggleDetails: toggleExpanded })}
          renderExpanded={(e) => (e.changes && Object.keys(e.changes).length ? <AuditChanges changes={e.changes} /> : null)}
        />
      </SectionCard>
    </>
  )
}

function AuditChanges({ changes }: { changes: NonNullable<AuditEntry["changes"]> }) {
  return (
    <dl className="mx-5 mb-4 ml-16 grid gap-px overflow-hidden rounded-lg border bg-border text-xs">
      {Object.entries(changes).map(([key, change]) => (
        <div key={key} className="grid grid-cols-[8rem_minmax(0,1fr)] bg-card">
          <dt className="px-3 py-2 font-mono text-muted-foreground">{key}</dt>
          <dd className="flex flex-col gap-0.5 px-3 py-2 font-mono">
            <span className={cn("break-words text-muted-foreground line-through")}>{show(change.from)}</span>
            <span className="break-words">{show(change.to)}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function show(value: unknown) {
  if (value === undefined || value === null || value === "") return "—"
  if (typeof value === "string") return value
  const text = JSON.stringify(value)
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}
