"use client"

import { HeartHandshake, Phone, Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { Patient, PatientGuardianLink } from "@/domain/types"
import { useCan } from "@/shared/lib/current-user"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { StatePill } from "@/shared/ui/atoms/state-pill"
import { EntityActionsButton, EntityContextMenu, EntityMenu } from "@/shared/ui/entity-menu"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { guardianLinkActions } from "../lib/guardian-actions"
import { usePatientGuardians, useUnlinkGuardian } from "../queries"
import { GuardianLinkDialog } from "./guardian-link-dialog"

export function GuardianLinksSection({ patient }: { patient: Patient }) {
  const canWrite = useCan("guardians:write")
  const { data, isLoading, error, refetch } = usePatientGuardians(patient.id)
  const unlink = useUnlinkGuardian(patient.id)
  const [editing, setEditing] = useState<PatientGuardianLink | "new" | null>(null)

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
            <EntityMenu
              key={link.id}
              actions={guardianLinkActions(
                { id: link.id, guardianName: guardian.fullName, patientName: patient.fullName },
                // Otimista: o vínculo sai da lista na hora; se o servidor recusar, a lista volta e o erro aparece em toast.
                { onEdit: () => setEditing(link), onRemove: () => unlink.mutate(link.id) }
              )}
            >
              <EntityContextMenu render={<li />} className="flex items-start justify-between gap-3 px-5 py-4 sm:items-center">
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
                <EntityActionsButton label={`Ações do vínculo de ${guardian.fullName}`} className="shrink-0" />
              </EntityContextMenu>
            </EntityMenu>
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
    </SectionCard>
  )
}
