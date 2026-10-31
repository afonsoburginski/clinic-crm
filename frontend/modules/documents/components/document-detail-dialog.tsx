"use client"

import { PencilLine } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { activeReleases } from "@/domain/documents"
import type { DocumentRelease, PatientDocument } from "@/domain/types"
import { formatDateTime } from "@/shared/lib/format"
import { StatePill } from "@/shared/ui/atoms/state-pill"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"
import { DialogErrorState, DialogLoadingState } from "@/shared/ui/molecules/dialog-states"

import { useDocument, useDocumentGuardians, useReleaseDocument, useRevokeRelease, useSetDocumentStatus } from "../queries"
import { ClassificationPill, DocumentStatusPill } from "./document-pills"

export function DocumentDetailDialog({ documentId, onClose, onEdit }: { documentId: string; onClose: () => void; onEdit: (doc: PatientDocument) => void }) {
  const { data, error } = useDocument(documentId)
  const [confirm, setConfirm] = useState<"issue" | "archive" | null>(null)
  const setStatus = useSetDocumentStatus(documentId)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        {error ? (
          <DialogErrorState title="Documento" error={error} />
        ) : !data ? (
          <DialogLoadingState title="Documento" />
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{data.doc.title}</DialogTitle>
                <ClassificationPill classification={data.doc.classification} />
                <DocumentStatusPill status={data.doc.status} />
              </div>
              <DialogDescription>
                {data.doc.type} · {data.patientName} · criado por {data.doc.createdByName} em {formatDateTime(data.doc.createdAt)}
                {data.doc.issuedAt && <> · emitido em {formatDateTime(data.doc.issuedAt)}</>}
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
              {data.doc.classification === "clinical" && (
                <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  Documento clínico: o conteúdo fica no prontuário do paciente. Este registro guarda só a classificação, o estado e as liberações.
                </p>
              )}
              {data.doc.notes && <p className="text-sm leading-relaxed text-pretty whitespace-pre-line">{data.doc.notes}</p>}

              {data.canWrite && data.doc.status !== "archived" && (
                <div className="flex flex-wrap gap-2">
                  {data.doc.status === "draft" && (
                    <>
                      <Button variant="outline" onClick={() => onEdit(data.doc)}>
                        <PencilLine aria-hidden />
                        Editar rascunho
                      </Button>
                      <Button onClick={() => setConfirm("issue")}>Emitir</Button>
                    </>
                  )}
                  <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirm("archive")}>
                    Arquivar
                  </Button>
                </div>
              )}

              <ReleasesSection doc={data.doc} canWrite={data.canWrite} guardianNames={data.guardianNames} />

              <ConfirmDialog
                open={confirm === "issue"}
                onOpenChange={(open) => !open && setConfirm(null)}
                title="Emitir documento?"
                description="Depois de emitido, o documento não pode mais ser editado e poderá ser liberado a responsáveis."
                confirmLabel="Emitir"
                pending={setStatus.isPending}
                onConfirm={() => setStatus.mutate("issued", { onSuccess: () => setConfirm(null) })}
              />
              <ConfirmDialog
                open={confirm === "archive"}
                onOpenChange={(open) => !open && setConfirm(null)}
                title="Arquivar documento?"
                description="Arquivar é definitivo e revoga as liberações ativas. O registro permanece para consulta."
                confirmLabel="Arquivar"
                destructive
                pending={setStatus.isPending}
                onConfirm={() => setStatus.mutate("archived", { onSuccess: () => setConfirm(null) })}
              />
            </DialogBody>

          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Liberação é explícita e individual: nada vai para o responsável por padrão (RN-DOC-005). */
function ReleasesSection({ doc, canWrite, guardianNames }: { doc: PatientDocument; canWrite: boolean; guardianNames: Record<string, string> }) {
  const { data: guardians, isPending: guardiansPending } = useDocumentGuardians(doc.patientId)
  const release = useReleaseDocument(doc.id)
  const revoke = useRevokeRelease(doc.id)
  const [releasing, setReleasing] = useState<{ guardianId: string; name: string } | null>(null)
  const [revoking, setRevoking] = useState<DocumentRelease | null>(null)

  const nameOf = (guardianId: string) =>
    guardianNames[guardianId] ?? guardians?.find((g) => g.guardian.id === guardianId)?.guardian.fullName ?? "Responsável"
  const active = activeReleases(doc)
  const canRelease = canWrite && doc.status === "issued"
  // Liberação ativa de quem já não está vinculado ao paciente continua visível e revogável (RN-DOC-009).
  const orphaned = guardiansPending ? [] : active.filter((r) => !guardians?.some((g) => g.guardian.id === r.guardianId))

  return (
    <section aria-label="Liberação para responsáveis" className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">Liberação para responsáveis</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Nada é liberado por padrão. Cada liberação é individual, só vale para responsáveis autorizados a receber documentos e pode ser revogada.
        </p>
      </div>

      {doc.status === "draft" && <p className="text-sm text-muted-foreground">Emita o documento para poder liberá-lo.</p>}
      {doc.status === "archived" && <p className="text-sm text-muted-foreground">Documento arquivado: nenhuma liberação ativa.</p>}

      {doc.status === "issued" && (
        <ul className="flex flex-col gap-1.5">
          {(guardians ?? []).map(({ link, guardian }) => {
            const current = active.find((r) => r.guardianId === guardian.id)
            return (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {guardian.fullName} <span className="font-normal text-muted-foreground">· {link.relationship}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {current
                      ? `Liberado em ${formatDateTime(current.releasedAt)} por ${current.releasedByName}`
                      : link.canReceiveDocuments
                        ? "Autorizado a receber documentos"
                        : "Sem autorização para receber documentos"}
                  </span>
                </div>
                {current ? (
                  <div className="flex items-center gap-2">
                    <StatePill tone="positive">Liberado</StatePill>
                    {canRelease && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setRevoking(current)}>
                        Revogar
                      </Button>
                    )}
                  </div>
                ) : (
                  canRelease && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!link.canReceiveDocuments}
                      onClick={() => setReleasing({ guardianId: guardian.id, name: guardian.fullName })}
                    >
                      Liberar
                    </Button>
                  )
                )}
              </li>
            )
          })}
          {guardians && !guardians.length && <li className="text-sm text-muted-foreground">Nenhum responsável vinculado ao paciente.</li>}
        </ul>
      )}

      {orphaned.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Liberações de quem não está mais vinculado</h4>
          <ul className="flex flex-col gap-1.5">
            {orphaned.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className="flex flex-col">
                  <span className="font-medium">{nameOf(r.guardianId)}</span>
                  <span className="text-xs text-muted-foreground">
                    Sem vínculo com o paciente · liberado em {formatDateTime(r.releasedAt)} por {r.releasedByName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatePill tone="positive">Liberado</StatePill>
                  {canWrite && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setRevoking(r)}>
                      Revogar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {doc.releases.some((r) => r.revokedAt) && (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Liberações revogadas</h4>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {doc.releases
              .filter((r) => r.revokedAt)
              .map((r) => (
                <li key={r.id}>
                  {nameOf(r.guardianId)}: liberado em {formatDateTime(r.releasedAt)}, revogado em {formatDateTime(r.revokedAt!)} — {r.revokeReason}
                </li>
              ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={!!releasing}
        onOpenChange={(open) => !open && setReleasing(null)}
        title="Liberar documento?"
        description={releasing && `${releasing.name} passará a ter acesso a este documento. A liberação fica registrada com sua autoria e pode ser revogada.`}
        confirmLabel="Liberar"
        pending={release.isPending}
        onConfirm={() => releasing && release.mutate({ guardianId: releasing.guardianId }, { onSuccess: () => setReleasing(null) })}
      />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revogar liberação?"
        description={revoking && `${nameOf(revoking.guardianId)} deixará de ter acesso ao documento. O registro da liberação permanece.`}
        confirmLabel="Revogar"
        destructive
        reason={{ label: "Motivo da revogação (mínimo 5 caracteres)", required: true }}
        pending={revoke.isPending}
        onConfirm={(reason) =>
          revoking && revoke.mutate({ releaseId: revoking.id, input: { reason: reason ?? "" } }, { onSuccess: () => setRevoking(null) })
        }
      />
    </section>
  )
}
