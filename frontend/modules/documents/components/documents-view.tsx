"use client"

import { FolderOpen, Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { activeReleases, CLASSIFICATION_LABELS, DOCUMENT_STATUS_LABELS, documentAccess } from "@/domain/documents"
import type { DocumentClassification, DocumentStatus, PatientDocument } from "@/domain/types"
import { useCurrentUser } from "@/shared/lib/current-user"
import { formatDate } from "@/shared/lib/format"
import { DemoNotice } from "@/shared/ui/molecules/demo-notice"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { useDocuments } from "../queries"
import { DocumentDetailDialog } from "./document-detail-dialog"
import { DocumentFormDialog } from "./document-form-dialog"
import { ClassificationPill, DocumentStatusPill } from "./document-pills"

const CLASS_FILTERS: { value: DocumentClassification | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "clinical", label: CLASSIFICATION_LABELS.clinical },
  { value: "administrative", label: CLASSIFICATION_LABELS.administrative },
  { value: "financial", label: CLASSIFICATION_LABELS.financial },
]

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os estados" },
  ...(Object.keys(DOCUMENT_STATUS_LABELS) as DocumentStatus[]).map((value) => ({ value, label: DOCUMENT_STATUS_LABELS[value] })),
]

export function DocumentsView() {
  const { user } = useCurrentUser()
  const [classification, setClassification] = useState<DocumentClassification | "all">("all")
  const [status, setStatus] = useState<DocumentStatus | "all">("all")
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<PatientDocument | "new" | null>(null)
  const { data, isLoading, error, refetch } = useDocuments({ classification, status })

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
      <DemoNotice>Interface de demonstração: só metadados ficam neste navegador (localStorage). Não há arquivos nem portal do responsável.</DemoNotice>

      <SectionCard bodyClassName="p-0">
        <Toolbar label="Filtros de documentos">
          <ToolbarGroup>
            <HaloToggleGroup items={CLASS_FILTERS} value={classification} onValueChange={(v) => v && setClassification(v as DocumentClassification | "all")} />
          </ToolbarGroup>
          <ToolbarGroup align="end">
            <SimpleSelect ariaLabel="Filtrar por estado" value={status} onChange={(v) => setStatus(v as DocumentStatus | "all")} options={STATUS_OPTIONS} className="w-48" />
          </ToolbarGroup>
        </Toolbar>

        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} className="m-4" />
        ) : isLoading ? (
          <ListSkeleton rows={5} className="p-4" />
        ) : !data?.length ? (
          <EmptyState icon={<FolderOpen aria-hidden />} title="Nenhum documento" description="Você só vê as classificações que seu perfil pode acessar." className="m-4" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Documento</TableHead>
                <TableHead className="hidden md:table-cell">Paciente</TableHead>
                <TableHead>Classificação</TableHead>
                <TableHead className="hidden sm:table-cell">Liberações</TableHead>
                <TableHead className="pr-5 text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(({ doc, patientName }) => {
                const released = activeReleases(doc).length
                return (
                  <TableRow
                    key={doc.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => setDetailId(doc.id)}
                    onKeyDown={(e) => e.key === "Enter" && setDetailId(doc.id)}
                  >
                    <TableCell className="pl-5">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{doc.title}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {doc.type} · {formatDate(doc.createdAt)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{patientName}</TableCell>
                    <TableCell>
                      <ClassificationPill classification={doc.classification} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{released ? `${released} ativa${released === 1 ? "" : "s"}` : "Nenhuma"}</TableCell>
                    <TableCell className="pr-5 text-right">
                      <DocumentStatusPill status={doc.status} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
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
    </>
  )
}
