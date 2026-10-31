"use client"

import { ClipboardCheck, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { ASSESSMENT_STATUS_LABELS } from "@/domain/assessment"
import type { Assessment, AssessmentStatus } from "@/domain/types"
import { useLookups } from "@/shared/lib/lookups"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { useAssessments } from "../queries"
import { AssessmentFormDialog } from "./assessment-form-dialog"
import { AssessmentStatusPill } from "./assessment-status-pill"

const STATUS_OPTIONS = (Object.keys(ASSESSMENT_STATUS_LABELS) as AssessmentStatus[]).map((value) => ({ value, label: ASSESSMENT_STATUS_LABELS[value] }))

const doneStages = (a: Assessment) => a.stages.filter((s) => s.status === "done").length

export function AssessmentsListView() {
  const router = useRouter()
  const { patient, professional, professionals } = useLookups()
  const [creating, setCreating] = useState(false)
  const { data, isLoading, error, refetch } = useAssessments("all")

  const columns = useMemo<DataTableColumn<Assessment>[]>(
    () => [
      {
        id: "assessment",
        header: "Avaliação",
        accessorFn: (a) => a.title,
        meta: {
          label: "Avaliação",
          alwaysVisible: true,
          searchValue: (a) => {
            const p = patient.get(a.patientId)
            return `${a.title} ${p?.fullName ?? ""} ${p?.socialName ?? ""}`
          },
        },
        cell: ({ row: { original: a } }) => {
          const p = patient.get(a.patientId)
          return (
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/avaliacoes/${a.id}`}
                className="truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {a.title}
              </Link>
              <span className="truncate text-xs text-muted-foreground">{p ? p.socialName || p.fullName : "Paciente"}</span>
            </div>
          )
        },
      },
      {
        id: "responsible",
        header: "Responsável",
        accessorFn: (a) => professional.get(a.responsibleProfessionalId)?.name ?? "",
        meta: {
          label: "Responsável",
          hideBelow: "md",
          searchValue: (a) => professional.get(a.responsibleProfessionalId)?.name ?? "",
          filter: { kind: "multiselect", label: "Responsável", options: professionals.map((pro) => ({ value: pro.id, label: pro.name })), value: (a) => a.responsibleProfessionalId },
        },
        cell: ({ row: { original: a } }) => professional.get(a.responsibleProfessionalId)?.name ?? "—",
      },
      {
        id: "stages",
        header: "Etapas",
        accessorFn: doneStages,
        meta: { label: "Etapas", hideBelow: "sm", className: "text-muted-foreground tabular-nums", filter: { kind: "range", label: "Etapas concluídas", value: doneStages } },
        cell: ({ row: { original: a } }) => `${doneStages(a)}/${a.stages.length}`,
      },
      {
        id: "status",
        header: "Situação",
        accessorFn: (a) => ASSESSMENT_STATUS_LABELS[a.status],
        meta: { label: "Situação", align: "right", filter: { kind: "status", label: "Situação", options: STATUS_OPTIONS, value: (a) => a.status } },
        cell: ({ row: { original: a } }) => <AssessmentStatusPill status={a.status} />,
      },
    ],
    [patient, professional, professionals]
  )

  return (
    <>
      <PageHeader
        title="Avaliações"
        description="Avaliações com responsável, finalidade, etapas e histórico. Interpretações são restritas ao perfil clínico."
        actions={
          <PermissionGate permission="clinical:write">
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Nova avaliação
            </Button>
          </PermissionGate>
        }
      />
      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Avaliações"
          tableKey="assessments"
          columns={columns}
          data={data ?? []}
          getRowId={(a) => a.id}
          defaultState={{ filters: { status: ["in_progress"] } }}
          searchPlaceholder="Avaliação ou paciente"
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          noun={["avaliação", "avaliações"]}
          empty={{ icon: <ClipboardCheck aria-hidden />, title: "Nenhuma avaliação cadastrada" }}
          onRowClick={(a) => router.push(`/avaliacoes/${a.id}`)}
        />
      </SectionCard>

      {creating && <AssessmentFormDialog onClose={() => setCreating(false)} onCreated={(id) => router.push(`/avaliacoes/${id}`)} />}
    </>
  )
}
