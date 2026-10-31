"use client"

import { Plus, Target } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AbaPlanStatus } from "@/domain/types"
import { formatBirthDate } from "@/shared/lib/format"
import { useLookups } from "@/shared/lib/lookups"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

import { useAbaPlans } from "../queries"
import { AbaPlanFormDialog } from "./aba-plan-form-dialog"
import { PlanStatusPill } from "./aba-status-pill"

const FILTERS: { value: AbaPlanStatus | "all"; label: string }[] = [
  { value: "active", label: "Ativos" },
  { value: "draft", label: "Rascunhos" },
  { value: "closed", label: "Encerrados" },
  { value: "all", label: "Todos" },
]

export function AbaPlansView() {
  const router = useRouter()
  const { patient, professional } = useLookups()
  const [status, setStatus] = useState<AbaPlanStatus | "all">("active")
  const [creating, setCreating] = useState(false)
  const { data, isLoading, error, refetch } = useAbaPlans(status)

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
        <Toolbar label="Filtros de planos">
          <ToolbarGroup>
            <HaloToggleGroup items={FILTERS} value={status} onValueChange={(v) => v && setStatus(v as AbaPlanStatus | "all")} />
          </ToolbarGroup>
        </Toolbar>
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} className="m-4" />
        ) : isLoading ? (
          <ListSkeleton rows={5} className="p-4" />
        ) : !data?.length ? (
          <EmptyState icon={<Target aria-hidden />} title="Nenhum plano nesta situação" className="m-4" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Plano</TableHead>
                <TableHead className="hidden md:table-cell">Responsável</TableHead>
                <TableHead className="hidden sm:table-cell">Início</TableHead>
                <TableHead className="hidden sm:table-cell">Objetivos</TableHead>
                <TableHead className="pr-5 text-right">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((plan) => {
                const p = patient.get(plan.patientId)
                return (
                  <TableRow key={plan.id} className="cursor-pointer" onClick={() => router.push(`/aba/${plan.id}`)}>
                    <TableCell className="pl-5">
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
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{professional.get(plan.responsibleProfessionalId)?.name ?? "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{formatBirthDate(plan.startDate)}</TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">{plan.goals.length}</TableCell>
                    <TableCell className="pr-5 text-right">
                      <PlanStatusPill status={plan.status} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {creating && <AbaPlanFormDialog onClose={() => setCreating(false)} onCreated={(id) => router.push(`/aba/${id}`)} />}
    </>
  )
}
