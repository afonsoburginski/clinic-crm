"use client"

import { ChevronDown } from "lucide-react"
import { useMemo, useState } from "react"

import type { AuditEntry } from "@/domain/types"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/shared/lib/format"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

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
}

const ACTION_LABELS: Record<string, string> = {
  create: "Criação",
  update: "Alteração",
  delete: "Remoção",
  status: "Status",
}

export function AuditView() {
  const [resource, setResource] = useState("all")
  const [actorId, setActorId] = useState("all")
  const query = useAuditLog({ resource, actorId })
  const allQuery = useAuditLog({ resource: "all", actorId: "all" })

  const actorOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of allQuery.data ?? []) seen.set(e.actorId, e.actorName)
    return [{ value: "all", label: "Todas as pessoas" }, ...[...seen].map(([value, label]) => ({ value, label }))]
  }, [allQuery.data])

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Registro imutável de quem alterou o quê. Conteúdo clínico não aparece aqui — apenas o fato da alteração."
      />
      <SectionCard
        title="Eventos"
        description={query.data ? `${query.data.length} registro${query.data.length === 1 ? "" : "s"}` : undefined}
        bodyClassName="p-0"
      >
        <Toolbar label="Filtros da auditoria">
          <ToolbarGroup>
            <SimpleSelect
              ariaLabel="Filtrar por recurso"
              value={resource}
              onChange={setResource}
              className="w-48"
              options={[
                { value: "all", label: "Todos os recursos" },
                ...Object.entries(RESOURCE_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
            <SimpleSelect ariaLabel="Filtrar por pessoa" value={actorId} onChange={setActorId} className="w-48" options={actorOptions} />
          </ToolbarGroup>
        </Toolbar>
        {query.isPending ? (
          <ListSkeleton rows={8} className="p-5" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState title="Nenhum evento" description="Ajuste os filtros ou faça uma alteração no sistema." />
        ) : (
          <ol className="divide-y">
            {query.data.slice(0, 200).map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ol>
        )}
      </SectionCard>
    </>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const changes = entry.changes ? Object.entries(entry.changes) : []

  const body = (
    <div className="flex items-start gap-3 px-5 py-3.5 text-left">
      <PersonAvatar name={entry.actorName} className="mt-0.5 size-8" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm leading-snug text-pretty">
          <span className="font-medium">{entry.actorName}</span>{" "}
          <span className="text-muted-foreground">·</span> {entry.summary}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <time dateTime={entry.at} className="font-mono">
            {formatDateTime(entry.at)}
          </time>
          <span>{RESOURCE_LABELS[entry.resource] ?? entry.resource}</span>
          <span>{ACTION_LABELS[entry.action] ?? entry.action}</span>
          {changes.length > 0 && <span>{changes.length} campo{changes.length === 1 ? "" : "s"}</span>}
        </div>
      </div>
      {changes.length > 0 && (
        <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      )}
    </div>
  )

  if (changes.length === 0) return <li>{body}</li>

  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          {body}
        </summary>
        <div>
          <dl className="mx-5 mb-4 ml-16 grid gap-px overflow-hidden rounded-lg border bg-border text-xs">
            {changes.map(([key, change]) => (
              <div key={key} className="grid grid-cols-[8rem_minmax(0,1fr)] bg-card">
                <dt className="px-3 py-2 font-mono text-muted-foreground">{key}</dt>
                <dd className="flex flex-col gap-0.5 px-3 py-2 font-mono">
                  <span className={cn("break-words text-muted-foreground line-through")}>{show(change.from)}</span>
                  <span className="break-words">{show(change.to)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </li>
  )
}

function show(value: unknown) {
  if (value === undefined || value === null || value === "") return "—"
  if (typeof value === "string") return value
  const text = JSON.stringify(value)
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}
