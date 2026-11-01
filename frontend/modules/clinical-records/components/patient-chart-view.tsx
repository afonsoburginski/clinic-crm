"use client"

import { FilePlus2, FileText } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { RECORD_KIND_LABELS, RECORD_STATUS_LABELS } from "@/domain/clinical-record"
import { isAdmin } from "@/domain/permissions"
import type { ClinicalRecord, ClinicalRecordKind, ClinicalRecordStatus } from "@/domain/types"
import { useCan, useCurrentUser } from "@/shared/lib/current-user"
import { formatAge, formatDateTime } from "@/shared/lib/format"
import { useUrlEditor } from "@/shared/lib/use-url-dialog"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { StatePill } from "@/shared/ui/atoms/state-pill"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { ErrorState } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { recordActions } from "../lib/record-actions"
import { useChartPatient, useFinalizeRecord, useRecords, useRectifyRecord } from "../queries"
import { RecordDetailDialog } from "./record-detail-dialog"
import { RecordFormDialog } from "./record-form-dialog"
import { RecordStatusPill } from "./record-status-pill"

const KIND_OPTIONS = (Object.keys(RECORD_KIND_LABELS) as ClinicalRecordKind[]).map((value) => ({ value, label: RECORD_KIND_LABELS[value] }))
const STATUS_OPTIONS = (Object.keys(RECORD_STATUS_LABELS) as ClinicalRecordStatus[]).map((value) => ({ value, label: RECORD_STATUS_LABELS[value] }))

const COLUMNS: DataTableColumn<ClinicalRecord>[] = [
  {
    id: "title",
    header: "Registro",
    accessorFn: (r) => r.title,
    meta: { label: "Registro", alwaysVisible: true, searchValue: (r) => `${r.title} ${r.authorName}` },
    cell: ({ row: { original: r } }) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{r.title}</span>
        <span className="text-xs text-muted-foreground">
          {RECORD_KIND_LABELS[r.kind]} · v{r.version} · {r.authorName}
        </span>
      </div>
    ),
  },
  {
    id: "kind",
    header: "Tipo",
    accessorFn: (r) => RECORD_KIND_LABELS[r.kind],
    meta: { label: "Tipo", hideBelow: "md", filter: { kind: "multiselect", label: "Tipo", options: KIND_OPTIONS, value: (r) => r.kind } },
    cell: ({ row: { original: r } }) => RECORD_KIND_LABELS[r.kind],
  },
  {
    id: "createdAt",
    header: "Criado em",
    accessorFn: (r) => r.createdAt,
    meta: { label: "Criado em", hideBelow: "sm", className: "text-muted-foreground", filter: { kind: "date-range", label: "Criado em", value: (r) => r.createdAt } },
    cell: ({ row: { original: r } }) => formatDateTime(r.createdAt),
  },
  {
    id: "status",
    header: "Situação",
    accessorFn: (r) => RECORD_STATUS_LABELS[r.status],
    meta: { label: "Situação", align: "right", filter: { kind: "status", label: "Situação", options: STATUS_OPTIONS, value: (r) => r.status } },
    cell: ({ row: { original: r } }) => (
      <span className="inline-flex gap-1.5">
        {r.rectifiesId && <StatePill tone="neutral">Retificação</StatePill>}
        <RecordStatusPill status={r.status} />
      </span>
    ),
  },
]

export function PatientChartView({ patientId }: { patientId: string }) {
  const patientQuery = useChartPatient(patientId)
  const records = useRecords(patientId, "all")
  const [detailId, setDetailId] = useState<string | null>(null)
  const { user } = useCurrentUser()
  const canWrite = useCan("clinical:write")
  const editor = useUrlEditor({ items: records.data, isLoading: records.isLoading, allowed: canWrite })
  const finalize = useFinalizeRecord()
  const rectify = useRectifyRecord()

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
            <Button onClick={editor.openNew}>
              <FilePlus2 aria-hidden />
              Novo registro
            </Button>
          </PermissionGate>
        }
      />


      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Registros do prontuário"
          tableKey="clinical-records"
          columns={COLUMNS}
          data={records.data ?? []}
          getRowId={(r) => r.id}
          defaultState={{ sort: [{ id: "createdAt", desc: true }] }}
          searchPlaceholder="Título ou autor"
          isLoading={records.isLoading}
          noun={["registro", "registros"]}
          empty={{ icon: <FileText aria-hidden />, title: "Nenhum registro", description: "Crie uma anamnese, evolução ou documento clínico. Todo registro começa como rascunho." }}
          onRowClick={(r) => setDetailId(r.id)}
          rowLabel={(r) => r.title}
          rowActions={(r) =>
            recordActions(r, {
              isAuthor: user?.id === r.authorId || isAdmin(user),
              onView: () => setDetailId(r.id),
              onEdit: () => editor.openEdit(r),
              onFinalize: () => finalize.mutate(r.id),
              onRectify: (reason) =>
                rectify.mutate({ id: r.id, input: { reason } }, { onSuccess: (draft) => editor.openEdit(draft) }),
            })
          }
        />
      </SectionCard>

      {(editor.creating || editor.editing) && (
        <RecordFormDialog key={editor.editing?.id ?? "novo"} patientId={patientId} record={editor.editing} onClose={editor.close} />
      )}
      {detailId && (
        <RecordDetailDialog
          recordId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(record) => {
            setDetailId(null)
            editor.openEdit(record)
          }}
        />
      )}
    </>
  )
}
