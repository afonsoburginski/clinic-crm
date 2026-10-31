"use client"

import { Plus, Target } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { PLAN_STATUS_LABELS } from "@/domain/aba"
import type { AbaPlan, AbaPlanStatus } from "@/domain/types"
import { formatBirthDate } from "@/shared/lib/format"
import { useLookups } from "@/shared/lib/lookups"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { useAbaPlans } from "../queries"
import { AbaPlanFormDialog } from "./aba-plan-form-dialog"
import { PlanStatusPill } from "./aba-status-pill"

const STATUS_OPTIONS = (Object.keys(PLAN_STATUS_LABELS) as AbaPlanStatus[]).map((value) => ({ value, label: PLAN_STATUS_LABELS[value] }))

export function AbaPlansView() {
  const router = useRouter()
  const { patient, professional, professionals } = useLookups()
  const [creating, setCreating] = useState(false)
  const { data, isLoading, error, refetch } = useAbaPlans("all")

  const columns = useMemo<DataTableColumn<AbaPlan>[]>(
    () => [
      {
        id: "plan",
        header: "Plano",
        accessorFn: (plan) => plan.title,
        meta: {
          label: "Plano",
          alwaysVisible: true,
          searchValue: (plan) => {
            const p = patient.get(plan.patientId)
            return `${plan.title} ${p?.fullName ?? ""} ${p?.socialName ?? ""}`
          },
        },
        cell: ({ row: { original: plan } }) => {
          const p = patient.get(plan.patientId)
          return (
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/aba/${plan.id}`}
                className="truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {plan.title}
              </Link>
              <span className="truncate text-xs text-muted-foreground">{p ? p.socialName || p.fullName : "Paciente"}</span>
            </div>
          )
        },
      },
      {
        id: "responsible",
        header: "Responsável",
        accessorFn: (plan) => professional.get(plan.responsibleProfessionalId)?.name ?? "",
        meta: {
          label: "Responsável",
          hideBelow: "md",
          searchValue: (plan) => professional.get(plan.responsibleProfessionalId)?.name ?? "",
          filter: { kind: "multiselect", label: "Responsável", options: professionals.map((pro) => ({ value: pro.id, label: pro.name })), value: (plan) => plan.responsibleProfessionalId },
        },
        cell: ({ row: { original: plan } }) => professional.get(plan.responsibleProfessionalId)?.name ?? "—",
      },
      {
        id: "startDate",
        header: "Início",
        accessorFn: (plan) => plan.startDate,
        meta: {
          label: "Início",
          hideBelow: "sm",
          className: "text-muted-foreground",
          filter: { kind: "date-range", label: "Início", value: (plan) => plan.startDate },
        },
        cell: ({ row: { original: plan } }) => formatBirthDate(plan.startDate),
      },
      {
        id: "goals",
        header: "Objetivos",
        accessorFn: (plan) => plan.goals.length,
        meta: { label: "Objetivos", hideBelow: "sm", className: "text-muted-foreground tabular-nums", filter: { kind: "range", label: "Objetivos", value: (plan) => plan.goals.length } },
        cell: ({ row: { original: plan } }) => plan.goals.length,
      },
      {
        id: "status",
        header: "Situação",
        accessorFn: (plan) => PLAN_STATUS_LABELS[plan.status],
        meta: { label: "Situação", align: "right", filter: { kind: "status", label: "Situação", options: STATUS_OPTIONS, value: (plan) => plan.status } },
        cell: ({ row: { original: plan } }) => <PlanStatusPill status={plan.status} />,
      },
    ],
    [patient, professional, professionals]
  )

  return (
    <>
      <PageHeader
        title="Plano ABA"
        description="Planos com objetivos e critério explícito, sessões e medidas registradas. O progresso vem só das medidas reais."
        actions={
          <PermissionGate permission="clinical:write">
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Novo plano
            </Button>
          </PermissionGate>
        }
      />
      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Planos ABA"
          tableKey="aba-plans"
          columns={columns}
          data={data ?? []}
          getRowId={(plan) => plan.id}
          defaultState={{ filters: { status: ["active"] }, sort: [{ id: "startDate", desc: true }] }}
          searchPlaceholder="Plano ou paciente"
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          noun={["plano", "planos"]}
          empty={{ icon: <Target aria-hidden />, title: "Nenhum plano cadastrado" }}
          onRowClick={(plan) => router.push(`/aba/${plan.id}`)}
        />
      </SectionCard>

      {creating && <AbaPlanFormDialog onClose={() => setCreating(false)} onCreated={(id) => router.push(`/aba/${id}`)} />}
    </>
  )
}
