"use client"

import { Pencil } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useCan } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { ActivePill } from "@/shared/ui/atoms/state-pill"
import { ProDot } from "@/shared/ui/atoms/pro-color"
import { ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { useProfessional } from "../queries"
import { ProfessionalFormDialog } from "./professional-form-dialog"
import { ScheduleEditor } from "./schedule-editor"
import { UnavailabilitySection } from "./unavailability-section"

export function ProfessionalDetailView({ id }: { id: string }) {
  const { data: professional, isLoading, error, refetch } = useProfessional(id)
  const { specialty } = useLookups()
  const canManage = useCan("professionals:manage")
  const [editing, setEditing] = useState(false)

  if (isLoading) return <ListSkeleton rows={5} />
  if (error || !professional) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <>
      <PageHeader
        back={{ href: "/profissionais", label: "Profissionais" }}
        eyebrow={
          <span className="flex items-center gap-2">
            <ProDot colorIndex={professional.colorIndex} /> Profissional
          </span>
        }
        title={professional.name}
        description={professional.specialtyIds.map((sid) => specialty.get(sid)?.name).filter(Boolean).join(" · ")}
        actions={
          canManage && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil data-icon="inline-start" aria-hidden />
              Editar dados
            </Button>
          )
        }
      />

      <SectionCard title="Dados" bodyClassName="p-0">
        <dl className="grid divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {[
            ["Situação", <ActivePill key="s" active={professional.active} />],
            ["Registro", professional.registry || "—"],
            ["E-mail", professional.email],
            ["Telefone", professional.phone || "—"],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex flex-col gap-1 px-5 py-4">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="truncate text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <ScheduleEditor key={JSON.stringify(professional.schedule)} professional={professional} editable={canManage} />
        <UnavailabilitySection professional={professional} editable={canManage} />
      </div>

      {editing && <ProfessionalFormDialog professional={professional} onClose={() => setEditing(false)} />}
    </>
  )
}
