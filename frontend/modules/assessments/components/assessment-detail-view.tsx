"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { canTransitionStage, STAGE_STATUS_LABELS } from "@/domain/assessment"
import { interpretationSchema, type InterpretationInput } from "@/domain/schemas"
import type { Assessment, AssessmentStageStatus } from "@/domain/types"
import { useCan, useCurrentUser } from "@/shared/lib/current-user"
import { formatDateTime } from "@/shared/lib/format"
import { useLookups } from "@/shared/lib/lookups"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { FormField } from "@/shared/ui/molecules/form-field"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { useAssessment, useCancelAssessment, useCompleteAssessment, useSaveInterpretation, useSetStage } from "../queries"
import { AssessmentStatusPill, StageStatusPill } from "./assessment-status-pill"

const STAGE_ACTION_LABELS: Record<AssessmentStageStatus, string> = {
  pending: "Voltar a pendente",
  in_progress: "Iniciar",
  done: "Concluir",
}
const STAGE_TARGETS: AssessmentStageStatus[] = ["in_progress", "done", "pending"]

export function AssessmentDetailView({ id }: { id: string }) {
  const { data: a, error, isLoading, refetch } = useAssessment(id)
  const { patient, professional } = useLookups()
  const { user } = useCurrentUser()
  const canWrite = useCan("clinical:write")
  const [confirm, setConfirm] = useState<"complete" | "cancel" | null>(null)
  const complete = useCompleteAssessment(id)
  const cancel = useCancelAssessment(id)

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (isLoading || !a) return <ListSkeleton rows={5} />

  const p = patient.get(a.patientId)
  const responsible = professional.get(a.responsibleProfessionalId)
  const isResponsible = !!user?.professionalId && user.professionalId === a.responsibleProfessionalId
  const open = a.status === "in_progress"

  return (
    <>
      <PageHeader
        back={{ href: "/avaliacoes", label: "Avaliações" }}
        title={a.title}
        badge={<AssessmentStatusPill status={a.status} />}
        description={
          <>
            {p ? p.socialName || p.fullName : "Paciente"} · Responsável: {responsible?.name ?? "—"}
          </>
        }
        actions={
          open &&
          canWrite && (
            <>
              <Button disabled={!isResponsible} onClick={() => setConfirm("complete")}>
                Concluir avaliação
              </Button>
              <Button variant="outline" disabled={!isResponsible} onClick={() => setConfirm("cancel")}>
                Cancelar
              </Button>
            </>
          )
        }
      />

      {open && canWrite && !isResponsible && (
        <p className="text-sm text-muted-foreground">Só {responsible?.name ?? "o responsável"} conclui ou cancela esta avaliação.</p>
      )}
      {a.status === "cancelled" && a.cancelReason && (
        <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Motivo do cancelamento:</span> {a.cancelReason}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-6">
          <SectionCard title="Etapas" description={`${a.stages.filter((s) => s.status === "done").length} de ${a.stages.length} concluídas`} bodyClassName="p-0">
            <ol className="divide-y">
              {a.stages.map((stage, index) => (
                <StageRow key={stage.id} assessment={a} stageId={stage.id} index={index} canAct={open && canWrite} />
              ))}
            </ol>
          </SectionCard>

          <SectionCard title="Interpretações" description="Restritas ao perfil clínico. Cada registro vira uma nova versão; as anteriores permanecem.">
            {a.interpretations.length ? (
              <ol className="flex flex-col gap-3">
                {[...a.interpretations].reverse().map((i) => (
                  <li key={i.id} className="flex flex-col gap-1.5 rounded-xl border bg-card/60 p-3.5">
                    <p className="text-xs text-muted-foreground">
                      Versão {i.version} · {i.authorName} · {formatDateTime(i.at)}
                    </p>
                    <p className="text-sm leading-relaxed text-pretty whitespace-pre-line">{i.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="Nenhuma interpretação registrada" className="py-8" />
            )}
            {open && (
              <PermissionGate permission="assessments:interpret">
                <InterpretationForm id={a.id} />
              </PermissionGate>
            )}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-6">
          <SectionCard title="Finalidade">
            <p className="text-sm leading-relaxed text-pretty whitespace-pre-line">{a.purpose}</p>
          </SectionCard>
          <SectionCard title="Histórico" description="Só recebe acréscimos.">
            <ol className="flex flex-col gap-2.5 text-sm">
              {[...a.history].reverse().map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex flex-col">
                  <span>{e.summary}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.actorName} · {formatDateTime(e.at)}
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "complete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Concluir avaliação?"
        description="Exige todas as etapas concluídas e ao menos uma interpretação. Depois de concluída, a avaliação fica somente leitura."
        confirmLabel="Concluir"
        pending={complete.isPending}
        onConfirm={() => complete.mutate(undefined, { onSuccess: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Cancelar avaliação?"
        description="O histórico e as interpretações já registradas são preservados."
        confirmLabel="Cancelar avaliação"
        destructive
        reason={{ label: "Motivo do cancelamento (mínimo 5 caracteres)", required: true }}
        pending={cancel.isPending}
        onConfirm={(reason) => cancel.mutate({ reason: reason ?? "" }, { onSuccess: () => setConfirm(null) })}
      />
    </>
  )
}

function StageRow({ assessment, stageId, index, canAct }: { assessment: Assessment; stageId: string; index: number; canAct: boolean }) {
  const stage = assessment.stages.find((s) => s.id === stageId)!
  const setStage = useSetStage(assessment.id)
  const targets = STAGE_TARGETS.filter((to) => canTransitionStage(stage.status, to))

  return (
    <li className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">
          {index + 1}. {stage.name}
        </span>
        {stage.doneAt && <span className="text-xs text-muted-foreground">Concluída em {formatDateTime(stage.doneAt)}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StageStatusPill status={stage.status} />
        {canAct &&
          targets.map((to) => (
            <Button
              key={to}
              size="sm"
              variant={to === "pending" ? "ghost" : "outline"}
              disabled={setStage.isPending}
              aria-label={`${STAGE_ACTION_LABELS[to]}: ${stage.name} (${STAGE_STATUS_LABELS[stage.status]})`}
              onClick={() => setStage.mutate({ stageId: stage.id, to })}
            >
              {STAGE_ACTION_LABELS[to]}
            </Button>
          ))}
      </div>
    </li>
  )
}

function InterpretationForm({ id }: { id: string }) {
  const save = useSaveInterpretation(id)
  const form = useForm<InterpretationInput>({ resolver: zodResolver(interpretationSchema), defaultValues: { text: "" } })
  const error = form.formState.errors.text?.message

  return (
    <form
      noValidate
      className="mt-4 flex flex-col gap-3 border-t pt-4"
      onSubmit={form.handleSubmit((values) => save.mutate(values, { onSuccess: () => form.reset({ text: "" }) }))}
    >
      <FormField id="interpretation-text" label="Nova interpretação" error={error} hint="Mínimo de 20 caracteres. Fica registrada com sua autoria e data.">
        <Textarea id="interpretation-text" rows={5} aria-invalid={!!error || undefined} {...form.register("text")} />
      </FormField>
      <Button type="submit" className="self-start" disabled={save.isPending}>
        {save.isPending ? "Salvando…" : "Registrar interpretação"}
      </Button>
    </form>
  )
}
