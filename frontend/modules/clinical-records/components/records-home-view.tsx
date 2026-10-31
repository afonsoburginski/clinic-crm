"use client"

import { FileText } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { formatAge, formatDate } from "@/shared/lib/format"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { StatePill } from "@/shared/ui/atoms/state-pill"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { chartActions } from "../lib/record-actions"
import { useChartPatients } from "../queries"

type ChartRow = NonNullable<ReturnType<typeof useChartPatients>["data"]>[number]

export function RecordsHomeView() {
  const router = useRouter()
  const { data, isLoading, error, refetch } = useChartPatients()

  const columns = useMemo<DataTableColumn<ChartRow>[]>(
    () => [
      {
        id: "patient",
        header: "Paciente",
        accessorFn: ({ patient }) => patient.socialName || patient.fullName,
        meta: { label: "Paciente", alwaysVisible: true, searchValue: ({ patient }) => `${patient.fullName} ${patient.socialName ?? ""} ${patient.code}` },
        cell: ({ row: { original: { patient } } }) => (
          <div className="flex items-center gap-3">
            <PersonAvatar name={patient.socialName || patient.fullName} size="sm" />
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/prontuarios/${patient.id}`}
                className="truncate text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {patient.socialName || patient.fullName}
              </Link>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono">{patient.code}</span> · {formatAge(patient.birthDate)}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: "drafts",
        header: "Rascunhos",
        accessorFn: ({ drafts }) => drafts,
        meta: { label: "Rascunhos", hideBelow: "sm", filter: { kind: "range", label: "Rascunhos", value: ({ drafts }) => drafts } },
        cell: ({ row: { original: { drafts } } }) =>
          drafts > 0 ? <StatePill tone="warning">{drafts === 1 ? "1 rascunho" : `${drafts} rascunhos`}</StatePill> : <span className="text-muted-foreground">—</span>,
      },
      {
        id: "total",
        header: "Registros",
        accessorFn: ({ total }) => total,
        meta: { label: "Registros", className: "text-muted-foreground", filter: { kind: "range", label: "Registros", value: ({ total }) => total } },
        cell: ({ row: { original: { total } } }) => (total ? `${total} ${total === 1 ? "registro" : "registros"}` : "Sem registros"),
      },
      {
        id: "lastAt",
        header: "Último registro",
        accessorFn: ({ lastAt }) => lastAt ?? "",
        meta: {
          label: "Último registro",
          align: "right",
          hideBelow: "md",
          className: "text-muted-foreground",
          filter: { kind: "date-range", label: "Último registro", value: ({ lastAt }) => lastAt },
        },
        cell: ({ row: { original: { lastAt } } }) => (lastAt ? formatDate(lastAt) : "—"),
      },
    ],
    []
  )

  return (
    <>
      <PageHeader
        title="Prontuários"
        description="Anamneses, evoluções e documentos clínicos dos pacientes que você atende. Visível só para profissionais com vínculo."
      />
      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Prontuários"
          tableKey="clinical-charts"
          columns={columns}
          data={data ?? []}
          getRowId={({ patient }) => patient.id}
          defaultState={{ sort: [{ id: "patient", desc: false }] }}
          searchPlaceholder="Nome ou código"
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          noun={["paciente", "pacientes"]}
          empty={{
            icon: <FileText aria-hidden />,
            title: "Nenhum paciente vinculado a você",
            description: "Pacientes aparecem aqui quando você é o profissional de referência ou tem atendimento agendado.",
          }}
          onRowClick={({ patient }) => router.push(`/prontuarios/${patient.id}`)}
          rowLabel={({ patient }) => patient.socialName || patient.fullName}
          rowActions={({ patient }) => chartActions(patient, { onOpen: () => router.push(`/prontuarios/${patient.id}`) })}
        />
      </SectionCard>
    </>
  )
}
