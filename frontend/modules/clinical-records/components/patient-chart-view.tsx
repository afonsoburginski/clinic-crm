"use client"

import { FilePlus2, FileText } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { RECORD_KIND_LABELS } from "@/domain/clinical-record"
import type { ClinicalRecord, ClinicalRecordKind } from "@/domain/types"
import { formatAge, formatDateTime } from "@/shared/lib/format"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { StatePill } from "@/shared/ui/atoms/state-pill"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

import { useChartPatient, useRecords } from "../queries"
import { RecordDetailDialog } from "./record-detail-dialog"
import { RecordFormDialog } from "./record-form-dialog"
import { RecordStatusPill } from "./record-status-pill"

const FILTERS: { value: ClinicalRecordKind | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "anamnesis", label: "Anamneses" },
  { value: "evolution", label: "Evoluções" },
  { value: "document", label: "Documentos" },
]

export function PatientChartView({ patientId }: { patientId: string }) {
  const patientQuery = useChartPatient(patientId)
  const [kind, setKind] = useState<ClinicalRecordKind | "all">("all")
  const records = useRecords(patientId, kind)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ClinicalRecord | "new" | null>(null)

  if (patientQuery.error) return <ErrorState error={patientQuery.error} onRetry={() => patientQuery.refetch()} />
  if (records.error) return <ErrorState error={records.error} onRetry={() => records.refetch()} />

  const patient = patientQuery.data
  const name = patient ? patient.socialName || patient.fullName : ""

  return (
    <>
      <PageHeader
        back={{ href: "/prontuarios", label: "Prontuários" }}
        leading={patient && <PersonAvatar name={name} size="lg" />}
        title={name || "Prontuário"}
        description={
          patient && (
            <>
              <span className="font-mono">{patient.code}</span> · {formatAge(patient.birthDate)}
            </>
          )
        }
        actions={
          <PermissionGate permission="clinical:write">
            <Button onClick={() => setEditing("new")}>
              <FilePlus2 aria-hidden />
              Novo registro
            </Button>
          </PermissionGate>
        }
      />


      <SectionCard bodyClassName="p-0">
        <Toolbar label="Filtro de registros">
          <ToolbarGroup>
            <HaloToggleGroup items={FILTERS} value={kind} onValueChange={(v) => v && setKind(v as ClinicalRecordKind | "all")} />
          </ToolbarGroup>
        </Toolbar>
        {records.isLoading ? (
          <ListSkeleton rows={4} className="p-4" />
        ) : !records.data?.length ? (
          <EmptyState
            icon={<FileText aria-hidden />}
            title="Nenhum registro"
            description="Crie uma anamnese, evolução ou documento clínico. Todo registro começa como rascunho."
            className="m-4"
          />
        ) : (
          <ul className="divide-y">
            {records.data.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setDetailId(r.id)}
                  className="flex w-full flex-col gap-2 px-5 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {RECORD_KIND_LABELS[r.kind]} · v{r.version} · {r.authorName} · {formatDateTime(r.createdAt)}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {r.rectifiesId && <StatePill tone="neutral">Retificação</StatePill>}
                    <RecordStatusPill status={r.status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {editing && (
        <RecordFormDialog patientId={patientId} record={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      )}
      {detailId && (
        <RecordDetailDialog
          recordId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(record) => {
            setDetailId(null)
            setEditing(record)
          }}
        />
      )}
    </>
  )
}
