"use client"

import { HeartHandshake, Phone, Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { Patient, PatientGuardianLink } from "@/domain/types"
import { useCan } from "@/shared/lib/current-user"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { StatePill } from "@/shared/ui/atoms/state-pill"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { usePatientGuardians, useUnlinkGuardian } from "../queries"
import { GuardianLinkDialog } from "./guardian-link-dialog"

export function GuardianLinksSection({ patient }: { patient: Patient }) {
  const canWrite = useCan("guardians:write")
  const { data, isLoading, error, refetch } = usePatientGuardians(patient.id)
  const unlink = useUnlinkGuardian(patient.id)
  const [editing, setEditing] = useState<PatientGuardianLink | "new" | null>(null)
  const [removing, setRemoving] = useState<{ linkId: string; name: string } | null>(null)

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <SectionCard
      title="Responsáveis vinculados"
      description="Quem pode agendar, receber documentos e ser contatado."
      actions={
        canWrite && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            Vincular
          </Button>
        )
      }
      bodyClassName="p-0"
    >
      {isLoading ? (
        <ListSkeleton rows={2} className="p-5" />
      ) : !data?.length ? (
        <EmptyState
          icon={<HeartHandshake aria-hidden />}
          title="Nenhum responsável vinculado"
          description="Vincule pais, tutores ou cuidadores autorizados."
          className="m-5"
        />
      ) : (
        <ul className="divide-y">
          {data.map(({ link, guardian }) => (
            <li key={link.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <PersonAvatar name={guardian.fullName} size="sm" />
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm">
                    <span className="font-medium">{guardian.fullName}</span>
                    <span className="text-muted-foreground"> · {link.relationship}</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="size-3" aria-hidden />
                    {guardian.phone}
                    {guardian.email && <> · {guardian.email}</>}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {link.isPrimaryContact && <StatePill tone="positive">Contato principal</StatePill>}
                    {link.isLegalGuardian && <StatePill>Responsável legal</StatePill>}
                    {link.canSchedule && <StatePill>Pode agendar</StatePill>}
                    {link.canReceiveDocuments && <StatePill>Recebe documentos</StatePill>}
                  </div>
                  {link.restrictions && (
                    <p className="text-xs leading-relaxed text-muted-foreground">Restrições: {link.restrictions}</p>
                  )}
                </div>
              </div>
              {canWrite && (
                <div className="flex gap-1 sm:shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(link)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setRemoving({ linkId: link.id, name: guardian.fullName })}
                  >
                    Remover
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <GuardianLinkDialog
          patient={patient}
          link={editing === "new" ? undefined : editing}
          linkedGuardianIds={data?.map((d) => d.guardian.id) ?? []}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remover vínculo?"
        description={removing && `${removing.name} deixará de ser responsável por ${patient.fullName}. O cadastro do responsável continua existindo.`}
        confirmLabel="Remover vínculo"
        destructive
        pending={unlink.isPending}
        onConfirm={() => {
          if (!removing) return
          // Otimista: o vínculo sai da lista e o diálogo fecha na hora; se o servidor recusar, a lista volta e o erro aparece em toast.
          unlink.mutate(removing.linkId)
          setRemoving(null)
        }}
      />
    </SectionCard>
  )
}
