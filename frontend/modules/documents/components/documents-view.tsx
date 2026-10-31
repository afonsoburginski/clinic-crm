"use client"

import { FolderOpen, Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { activeReleases, CLASSIFICATION_LABELS, DOCUMENT_STATUS_LABELS, documentAccess } from "@/domain/documents"
import type { DocumentClassification, DocumentStatus, PatientDocument } from "@/domain/types"
import { useCurrentUser } from "@/shared/lib/current-user"
import { formatDate } from "@/shared/lib/format"
import type { DocumentRow } from "@/shared/api/api"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { documentActions } from "../lib/document-actions"
import { useDocuments, useSetDocumentStatusRow } from "../queries"
import { DocumentDetailDialog } from "./document-detail-dialog"
import { DocumentFormDialog } from "./document-form-dialog"
import { ClassificationPill, DocumentStatusPill } from "./document-pills"

const CLASSIFICATION_OPTIONS = (Object.keys(CLASSIFICATION_LABELS) as DocumentClassification[]).map((value) => ({ value, label: CLASSIFICATION_LABELS[value] }))
const STATUS_OPTIONS = (Object.keys(DOCUMENT_STATUS_LABELS) as DocumentStatus[]).map((value) => ({ value, label: DOCUMENT_STATUS_LABELS[value] }))

const releasedCount = ({ doc }: DocumentRow) => activeReleases(doc).length

const COLUMNS: DataTableColumn<DocumentRow>[] = [
  {
    id: "document",
    header: "Documento",
    accessorFn: ({ doc }) => doc.title,
    meta: { label: "Documento", alwaysVisible: true, searchValue: ({ doc }) => `${doc.title} ${doc.type}` },
    cell: ({ row: { original: { doc } } }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{doc.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {doc.type} · {formatDate(doc.createdAt)}
        </span>
      </div>
    ),
  },
  {
    id: "patient",
    header: "Paciente",
    accessorFn: ({ patientName }) => patientName,
    meta: { label: "Paciente", hideBelow: "md", searchValue: ({ patientName }) => patientName },
    cell: ({ row: { original } }) => original.patientName,
  },
  {
    id: "classification",
    header: "Classificação",
    accessorFn: ({ doc }) => CLASSIFICATION_LABELS[doc.classification],
    meta: { label: "Classificação", filter: { kind: "multiselect", label: "Classificação", options: CLASSIFICATION_OPTIONS, value: ({ doc }) => doc.classification } },
    cell: ({ row: { original: { doc } } }) => <ClassificationPill classification={doc.classification} />,
  },
  {
    id: "createdAt",
    header: "Criado em",
    accessorFn: ({ doc }) => doc.createdAt,
    meta: { label: "Criado em", hideBelow: "lg", className: "text-muted-foreground", filter: { kind: "date-range", label: "Criado em", value: ({ doc }) => doc.createdAt } },
    cell: ({ row: { original: { doc } } }) => formatDate(doc.createdAt),
  },
  {
    id: "releases",
    header: "Liberações",
    accessorFn: releasedCount,
    meta: { label: "Liberações", hideBelow: "sm", className: "text-muted-foreground", filter: { kind: "range", label: "Liberações ativas", value: releasedCount } },
    cell: ({ row: { original } }) => {
      const released = releasedCount(original)
      return released ? `${released} ativa${released === 1 ? "" : "s"}` : "Nenhuma"
    },
  },
  {
    id: "status",
    header: "Estado",
    accessorFn: ({ doc }) => DOCUMENT_STATUS_LABELS[doc.status],
    meta: { label: "Estado", align: "right", filter: { kind: "status", label: "Estado", options: STATUS_OPTIONS, value: ({ doc }) => doc.status } },
    cell: ({ row: { original: { doc } } }) => <DocumentStatusPill status={doc.status} />,
  },
]

export function DocumentsView() {
  const { user } = useCurrentUser()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<PatientDocument | "new" | null>(null)
  const [template, setTemplate] = useState<PatientDocument | null>(null)
  const setStatus = useSetDocumentStatusRow()
  const { data, isLoading, error, refetch, isPlaceholderData } = useDocuments({ classification: "all", status: "all" })

  const canCreate = (["clinical", "administrative", "financial"] as const).some((c) => documentAccess(user, c, true).write)

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Documentos classificados por tipo de conteúdo, com estado e permissões próprias. A liberação a responsáveis é sempre explícita."
        actions={
          canCreate && (
            <Button onClick={() => setEditing("new")}>
              <Plus aria-hidden />
              Novo documento
            </Button>
          )
        }
      />

      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Documentos"
          tableKey="documents"
          columns={COLUMNS}
          data={data ?? []}
          getRowId={({ doc }) => doc.id}
          defaultState={{ sort: [{ id: "createdAt", desc: true }] }}
          searchPlaceholder="Título, tipo ou paciente"
          isLoading={isLoading}
          isRefreshing={isPlaceholderData}
          error={error}
          onRetry={() => refetch()}
          noun={["documento", "documentos"]}
          empty={{ icon: <FolderOpen aria-hidden />, title: "Nenhum documento", description: "Você só vê as classificações que seu perfil pode acessar." }}
          onRowClick={({ doc }) => setDetailId(doc.id)}
          rowLabel={({ doc }) => doc.title}
          rowActions={({ doc, canWrite }) =>
            documentActions(doc, canWrite, {
              onView: () => setDetailId(doc.id),
              onEdit: () => setEditing(doc),
              onDuplicate: () => setTemplate(doc),
              onIssue: () => setStatus.mutate({ id: doc.id, to: "issued" }),
              onArchive: () => setStatus.mutate({ id: doc.id, to: "archived" }),
            })
          }
        />
      </SectionCard>

      {detailId && (
        <DocumentDetailDialog
          documentId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(doc) => {
            setDetailId(null)
            setEditing(doc)
          }}
        />
      )}
      {editing && <DocumentFormDialog document={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {template && <DocumentFormDialog template={template} onClose={() => setTemplate(null)} />}
    </>
  )
}
