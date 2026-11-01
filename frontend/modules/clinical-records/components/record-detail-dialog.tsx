"use client"

import { PencilLine, ShieldCheck, Undo2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RECORD_KIND_LABELS, RECORD_STATUS_LABELS } from "@/domain/clinical-record"
import { isAdmin } from "@/domain/permissions"
import type { ClinicalRecord, ClinicalRecordAction } from "@/domain/types"
import { cn } from "@/lib/utils"
import { useCan, useCurrentUser } from "@/shared/lib/current-user"
import { formatDateTime } from "@/shared/lib/format"
import { StatePill } from "@/shared/ui/atoms/state-pill"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"
import { DialogErrorState, DialogLoadingState } from "@/shared/ui/molecules/dialog-states"

import { useFinalizeRecord, useRecord, useRecordVersions, useRectifyRecord } from "../queries"
import { RecordStatusPill } from "./record-status-pill"

const ACTION_LABELS: Record<ClinicalRecordAction, string> = {
  created: "Rascunho criado",
  updated: "Rascunho editado",
  finalized: "Finalizado",
  rectification_started: "Retificação iniciada",
  rectified: "Marcado como retificado",
}

export function RecordDetailDialog({
  recordId,
  onClose,
  onEdit,
}: {
  recordId: string
  onClose: () => void
  /** Abre o editor de rascunho (também usado após iniciar uma retificação). */
  onEdit: (record: ClinicalRecord) => void
}) {
  const [currentId, setCurrentId] = useState(recordId)
  const [confirm, setConfirm] = useState<"finalize" | "rectify" | null>(null)
  const { user } = useCurrentUser()
  const canWrite = useCan("clinical:write")
  const { data: record, error } = useRecord(currentId)
  const versions = useRecordVersions(record?.rootId ?? "")
  const finalize = useFinalizeRecord()
  const rectify = useRectifyRecord()

  const isAuthor = !!record && canWrite && (user?.id === record.authorId || isAdmin(user))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        {error ? (
          <DialogErrorState title="Registro clínico" error={error} />
        ) : !record ? (
          <DialogLoadingState title="Registro clínico" />
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{record.title}</DialogTitle>
                <RecordStatusPill status={record.status} />
                {record.rectifiesId && <StatePill tone="neutral">Retificação · v{record.version}</StatePill>}
              </div>
              <DialogDescription>
                {RECORD_KIND_LABELS[record.kind]} · versão {record.version} · autoria de {record.authorName} em {formatDateTime(record.createdAt)}
                {record.finalizedAt && <> · finalizado em {formatDateTime(record.finalizedAt)}</>}
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
              {record.status === "rectified" && (
                <p className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Esta versão foi retificada e permanece preservada, com autoria e conteúdo originais.
                </p>
              )}
              {record.rectificationReason && (
                <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Motivo da retificação:</span> {record.rectificationReason}
                </p>
              )}

              <article className="rounded-xl border bg-card/60 p-4 text-sm leading-relaxed text-pretty whitespace-pre-line">
                {record.content || <span className="text-muted-foreground">Sem conteúdo ainda.</span>}
              </article>

              {isAuthor && (
                <div className="flex flex-wrap gap-2">
                  {record.status === "draft" && (
                    <>
                      <Button variant="outline" onClick={() => onEdit(record)}>
                        <PencilLine aria-hidden />
                        Editar rascunho
                      </Button>
                      <Button onClick={() => setConfirm("finalize")}>Finalizar</Button>
                    </>
                  )}
                  {record.status === "finalized" && (
                    <Button variant="outline" onClick={() => setConfirm("rectify")}>
                      <Undo2 aria-hidden />
                      Retificar
                    </Button>
                  )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <section aria-label="Versões" className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Versões</h3>
                  <ul className="flex flex-col gap-1">
                    {(versions.data ?? []).map((v) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => setCurrentId(v.id)}
                          aria-current={v.id === record.id ? "true" : undefined}
                          className={cn(
                            "flex w-full flex-col rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50",
                            v.id === record.id && "bg-muted/60 ring-1 ring-border"
                          )}
                        >
                          <span className="font-medium">
                            v{v.version} · {RECORD_STATUS_LABELS[v.status]}
                          </span>
                          <span className="text-muted-foreground">
                            {v.authorName} · {formatDateTime(v.createdAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
                <section aria-label="Histórico" className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Histórico desta versão</h3>
                  <ol className="flex flex-col gap-1.5 text-xs">
                    {record.history.map((e, i) => (
                      <li key={`${e.at}-${i}`} className="flex flex-col">
                        <span className="font-medium">{ACTION_LABELS[e.action]}</span>
                        <span className="text-muted-foreground">
                          {e.actorName} · {formatDateTime(e.at)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <ConfirmDialog
                open={confirm === "finalize"}
                onOpenChange={(open) => !open && setConfirm(null)}
                title="Finalizar registro?"
                description="Depois de finalizado, o conteúdo não pode ser editado. Correções serão feitas por retificação, preservando esta versão."
                confirmLabel="Finalizar"
                pending={finalize.isPending}
                onConfirm={() => finalize.mutate(record.id, { onSuccess: () => setConfirm(null) })}
              />
              <ConfirmDialog
                open={confirm === "rectify"}
                onOpenChange={(open) => !open && setConfirm(null)}
                title="Retificar registro?"
                description="Uma nova versão será criada em rascunho a partir desta. A versão atual segue válida e preservada até você finalizar a retificação."
                confirmLabel="Iniciar retificação"
                reason={{ label: "Motivo da retificação (mínimo 10 caracteres)", required: true }}
                pending={rectify.isPending}
                onConfirm={(reason) =>
                  rectify.mutate(
                    { id: record.id, input: { reason: reason ?? "" } },
                    {
                      onSuccess: (draft) => {
                        setConfirm(null)
                        onEdit(draft)
                      },
                    }
                  )
                }
              />
            </DialogBody>

          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
