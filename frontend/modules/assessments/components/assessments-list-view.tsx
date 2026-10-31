"use client"

import { ClipboardCheck, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AssessmentStatus } from "@/domain/types"
import { useLookups } from "@/shared/lib/lookups"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

import { useAssessments } from "../queries"
import { AssessmentFormDialog } from "./assessment-form-dialog"
import { AssessmentStatusPill } from "./assessment-status-pill"

const FILTERS: { value: AssessmentStatus | "all"; label: string }[] = [
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluídas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "all", label: "Todas" },
]

export function AssessmentsListView() {
  const router = useRouter()
  const { patient, professional } = useLookups()
  const [status, setStatus] = useState<AssessmentStatus | "all">("in_progress")
  const [creating, setCreating] = useState(false)
  const { data, isLoading, error, refetch } = useAssessments(status)

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
        <Toolbar label="Filtros de avaliações">
          <ToolbarGroup>
            <HaloToggleGroup items={FILTERS} value={status} onValueChange={(v) => v && setStatus(v as AssessmentStatus | "all")} />
          </ToolbarGroup>
        </Toolbar>
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} className="m-4" />
        ) : isLoading ? (
          <ListSkeleton rows={5} className="p-4" />
        ) : !data?.length ? (
          <EmptyState icon={<ClipboardCheck aria-hidden />} title="Nenhuma avaliação nesta situação" className="m-4" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Avaliação</TableHead>
                <TableHead className="hidden md:table-cell">Responsável</TableHead>
                <TableHead className="hidden sm:table-cell">Etapas</TableHead>
                <TableHead className="pr-5 text-right">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => {
                const p = patient.get(a.patientId)
                const done = a.stages.filter((s) => s.status === "done").length
                return (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => router.push(`/avaliacoes/${a.id}`)}>
                    <TableCell className="pl-5">
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
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{professional.get(a.responsibleProfessionalId)?.name ?? "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                      {done}/{a.stages.length}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <AssessmentStatusPill status={a.status} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {creating && <AssessmentFormDialog onClose={() => setCreating(false)} onCreated={(id) => router.push(`/avaliacoes/${id}`)} />}
    </>
  )
}
