"use client"

import { FileText } from "lucide-react"
import Link from "next/link"
import { useDeferredValue, useMemo, useState } from "react"

import { formatAge, formatDate } from "@/shared/lib/format"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { StatePill } from "@/shared/ui/atoms/state-pill"
import { DemoNotice } from "@/shared/ui/molecules/demo-notice"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SearchInput } from "@/shared/ui/molecules/search-input"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

import { useChartPatients } from "../queries"

export function RecordsHomeView() {
  const { data, isLoading, error, refetch } = useChartPatients()
  const [search, setSearch] = useState("")
  const deferred = useDeferredValue(search).trim().toLowerCase()

  const rows = useMemo(
    () => (data ?? []).filter(({ patient }) => !deferred || `${patient.fullName} ${patient.socialName ?? ""} ${patient.code}`.toLowerCase().includes(deferred)),
    [data, deferred]
  )

  return (
    <>
      <PageHeader
        title="Prontuários"
        description="Anamneses, evoluções e documentos clínicos dos pacientes que você atende. Visível só para profissionais com vínculo."
      />
      <DemoNotice />
      <SectionCard bodyClassName="p-0">
        <Toolbar label="Busca de prontuários">
          <ToolbarGroup className="w-full sm:max-w-xs">
            <SearchInput value={search} onChange={setSearch} placeholder="Nome ou código" label="Buscar prontuário" />
          </ToolbarGroup>
        </Toolbar>
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} className="m-4" />
        ) : isLoading ? (
          <ListSkeleton rows={6} className="p-4" />
        ) : !rows.length ? (
          <EmptyState
            icon={<FileText aria-hidden />}
            title={search ? "Nenhum prontuário encontrado" : "Nenhum paciente vinculado a você"}
            description={search ? "Tente outro nome ou código." : "Pacientes aparecem aqui quando você é o profissional de referência ou tem atendimento agendado."}
            className="m-4"
          />
        ) : (
          <ul className="divide-y">
            {rows.map(({ patient, total, drafts, lastAt }) => (
              <li key={patient.id}>
                <Link
                  href={`/prontuarios/${patient.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <PersonAvatar name={patient.socialName || patient.fullName} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{patient.socialName || patient.fullName}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-mono">{patient.code}</span> · {formatAge(patient.birthDate)}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {drafts > 0 && <StatePill tone="warning">{drafts === 1 ? "1 rascunho" : `${drafts} rascunhos`}</StatePill>}
                    <span className="text-xs text-muted-foreground">
                      {total ? `${total} ${total === 1 ? "registro" : "registros"}${lastAt ? ` · ${formatDate(lastAt)}` : ""}` : "Sem registros"}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  )
}
