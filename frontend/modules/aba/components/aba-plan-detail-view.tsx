"use client"

import { ClipboardPen, PencilLine, Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { GoalProgress } from "@/domain/aba"
import type { AbaGoal, AbaPlan, AbaSession } from "@/domain/types"
import { useCan } from "@/shared/lib/current-user"
import { formatBirthDate, formatDateTime } from "@/shared/lib/format"
import { useLookups } from "@/shared/lib/lookups"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"
import { DemoNotice } from "@/shared/ui/molecules/demo-notice"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { useAbaPlan, useActivatePlan, useClosePlan, useSetGoalStatus, useVoidSession } from "../queries"
import { AbaGoalDialog } from "./aba-goal-dialog"
import { AbaPlanFormDialog } from "./aba-plan-form-dialog"
import { AbaSessionDialog } from "./aba-session-dialog"
import { GoalStatusPill, PlanStatusPill } from "./aba-status-pill"

type Dialogs = { kind: "plan" } | { kind: "goal"; goal?: AbaGoal } | { kind: "session" } | null

export function AbaPlanDetailView({ id }: { id: string }) {
  const { data, error, isLoading, refetch } = useAbaPlan(id)
  const { patient, professional } = useLookups()
  const canWrite = useCan("clinical:write")
  const [dialog, setDialog] = useState<Dialogs>(null)
  const [closing, setClosing] = useState(false)
  const activate = useActivatePlan(id)
  const close = useClosePlan(id)

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (isLoading || !data) return <ListSkeleton rows={5} />

  const { plan, sessions, progress } = data
  const p = patient.get(plan.patientId)
  const editable = canWrite && plan.status !== "closed"
  const progressOf = (goalId: string) => progress.find((x) => x.goalId === goalId)

  return (
    <>
      <PageHeader
        back={{ href: "/aba", label: "Plano ABA" }}
        title={plan.title}
        badge={<PlanStatusPill status={plan.status} />}
        description={
          <>
            {p ? p.socialName || p.fullName : "Paciente"} · Responsável: {professional.get(plan.responsibleProfessionalId)?.name ?? "—"} · Início{" "}
            {formatBirthDate(plan.startDate)}
            {plan.reviewDate && <> · Revisão {formatBirthDate(plan.reviewDate)}</>}
          </>
        }
        actions={
          editable && (
            <>
          <Button variant="outline" onClick={() => setDialog({ kind: "plan" })}>
            <PencilLine aria-hidden />
            Editar plano
          </Button>
          {plan.status === "draft" && (
            <Button disabled={activate.isPending} onClick={() => activate.mutate()}>
              Ativar plano
            </Button>
          )}
          {plan.status === "active" && (
            <>
              <Button onClick={() => setDialog({ kind: "session" })}>
                <ClipboardPen aria-hidden />
                Registrar sessão
              </Button>
              <Button variant="outline" onClick={() => setClosing(true)}>
                Encerrar
              </Button>
            </>
          )}
            </>
          )
        }
      />

      <DemoNotice />
      {plan.status === "closed" && plan.closeReason && (
        <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Plano encerrado:</span> {plan.closeReason}. Somente leitura.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-6">
          <SectionCard
            title="Objetivos"
            description="Progresso calculado só das medidas registradas nas sessões."
            actions={
              editable && (
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "goal" })}>
                  <Plus aria-hidden />
                  Objetivo
                </Button>
              )
            }
            bodyClassName="p-0"
          >
            {plan.goals.length ? (
              <ul className="divide-y">
                {plan.goals.map((g) => (
                  <GoalItem key={g.id} plan={plan} goal={g} progress={progressOf(g.id)} editable={editable} onEdit={() => setDialog({ kind: "goal", goal: g })} />
                ))}
              </ul>
            ) : (
              <EmptyState title="Nenhum objetivo" description="Inclua ao menos um objetivo, com critério explícito, para ativar o plano." className="m-4" />
            )}
          </SectionCard>

          <SessionsSection plan={plan} sessions={sessions} editable={editable} />
        </div>

        <SectionCard title="Histórico de alterações" description="Só recebe acréscimos, com autor e data.">
          <ol className="flex flex-col gap-3 text-sm">
            {[...plan.changeLog].reverse().map((c, i) => (
              <li key={`${c.at}-${i}`} className="flex flex-col gap-0.5">
                <span>{c.summary}</span>
                <span className="text-xs text-muted-foreground">
                  {c.actorName} · {formatDateTime(c.at)}
                </span>
                {c.changes && (
                  <dl className="mt-1 flex flex-col gap-0.5 text-xs">
                    {Object.entries(c.changes).map(([field, change]) => (
                      <div key={field} className="flex flex-wrap gap-1 font-mono">
                        <dt className="text-muted-foreground">{field}:</dt>
                        <dd>
                          <span className="text-muted-foreground line-through">{show(change.from)}</span> → {show(change.to)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>

      {dialog?.kind === "plan" && <AbaPlanFormDialog plan={plan} onClose={() => setDialog(null)} />}
      {dialog?.kind === "goal" && <AbaGoalDialog planId={plan.id} goal={dialog.goal} onClose={() => setDialog(null)} />}
      {dialog?.kind === "session" && <AbaSessionDialog plan={plan} onClose={() => setDialog(null)} />}

      <ConfirmDialog
        open={closing}
        onOpenChange={setClosing}
        title="Encerrar plano?"
        description="O plano passa a ser somente leitura. Objetivos, sessões e histórico permanecem."
        confirmLabel="Encerrar plano"
        destructive
        reason={{ label: "Motivo do encerramento (mínimo 5 caracteres)", required: true }}
        pending={close.isPending}
        onConfirm={(reason) => close.mutate({ reason: reason ?? "" }, { onSuccess: () => setClosing(false) })}
      />
    </>
  )
}

function show(value: unknown) {
  return value === undefined || value === null || value === "" ? "—" : String(value)
}

function GoalItem({
  plan,
  goal,
  progress,
  editable,
  onEdit,
}: {
  plan: AbaPlan
  goal: AbaGoal
  progress?: GoalProgress
  editable: boolean
  onEdit: () => void
}) {
  const setStatus = useSetGoalStatus(plan.id)
  const [discontinuing, setDiscontinuing] = useState(false)
  const recent = [...(progress?.points ?? [])].reverse().slice(0, 5)

  return (
    <li className="flex flex-col gap-2.5 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{goal.title}</span>
          {goal.description && <span className="text-xs text-muted-foreground">{goal.description}</span>}
        </div>
        <GoalStatusPill status={goal.status} />
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Critério:</span> {goal.criterionText} — meta de {goal.targetPercent}% em {goal.consecutiveSessions}{" "}
        {goal.consecutiveSessions === 1 ? "sessão" : "sessões consecutivas"}.
      </p>

      <div className="flex flex-col gap-1 text-sm">
        {!progress || progress.state === "no_data" ? (
          <span className="text-muted-foreground">Sem medidas registradas.</span>
        ) : (
          <span>
            Última medida: <span className="font-medium tabular-nums">{progress.lastPercent}%</span>
            {progress.criterionMet ? " · critério atingido" : " · critério ainda não atingido"}
          </span>
        )}
        {recent.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
            {recent.map((m) => (
              <li key={`${m.sessionId}`}>
                {formatBirthDate(m.date)}: {m.percent}% ({m.correct}/{m.trials})
              </li>
            ))}
          </ul>
        )}
      </div>

      {goal.statusReason && <p className="text-xs text-muted-foreground">Motivo: {goal.statusReason}</p>}

      {editable && goal.status === "active" && (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!progress?.criterionMet || setStatus.isPending}
            title={progress?.criterionMet ? undefined : "Disponível quando as medidas registradas atingirem o critério."}
            onClick={() => setStatus.mutate({ goalId: goal.id, input: { to: "achieved", reason: "" } })}
          >
            Marcar como alcançado
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDiscontinuing(true)}>
            Descontinuar
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={discontinuing}
        onOpenChange={setDiscontinuing}
        title="Descontinuar objetivo?"
        description="O objetivo deixa de receber medidas, mas o histórico e as medidas anteriores permanecem."
        confirmLabel="Descontinuar"
        destructive
        reason={{ label: "Motivo (mínimo 5 caracteres)", required: true }}
        pending={setStatus.isPending}
        onConfirm={(reason) =>
          setStatus.mutate({ goalId: goal.id, input: { to: "discontinued", reason: reason ?? "" } }, { onSuccess: () => setDiscontinuing(false) })
        }
      />
    </li>
  )
}

function SessionsSection({ plan, sessions, editable }: { plan: AbaPlan; sessions: AbaSession[]; editable: boolean }) {
  const [voiding, setVoiding] = useState<AbaSession | null>(null)
  const voidSession = useVoidSession()
  const goalTitle = (goalId: string) => plan.goals.find((g) => g.id === goalId)?.title ?? "Objetivo"

  return (
    <SectionCard title="Sessões" description={sessions.length ? `${sessions.length} registrada${sessions.length === 1 ? "" : "s"}` : undefined} bodyClassName="p-0">
      {sessions.length ? (
        <ul className="divide-y">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-col gap-1.5 px-5 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {formatBirthDate(s.date)} <span className="font-normal text-muted-foreground">· {s.authorName}</span>
                </span>
                {s.voidedAt ? (
                  <span className="text-xs text-muted-foreground">Anulada em {formatDateTime(s.voidedAt)}</span>
                ) : (
                  editable && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setVoiding(s)}>
                      Anular
                    </Button>
                  )
                )}
              </div>
              <ul className={s.voidedAt ? "flex flex-col gap-0.5 text-xs text-muted-foreground line-through" : "flex flex-col gap-0.5 text-xs text-muted-foreground"}>
                {s.measures.map((m) => (
                  <li key={m.goalId}>
                    {goalTitle(m.goalId)}: {m.correct}/{m.trials}
                    {m.note && ` — ${m.note}`}
                  </li>
                ))}
              </ul>
              {s.notes && <p className="text-xs leading-relaxed text-pretty">{s.notes}</p>}
              {s.voidReason && <p className="text-xs text-muted-foreground">Motivo da anulação: {s.voidReason}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nenhuma sessão registrada" description="Sem sessões, nenhum progresso é exibido." className="m-4" />
      )}

      <ConfirmDialog
        open={!!voiding}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="Anular sessão?"
        description="A sessão permanece registrada, marcada como anulada, e deixa de contar no progresso."
        confirmLabel="Anular sessão"
        destructive
        reason={{ label: "Motivo da anulação (mínimo 5 caracteres)", required: true }}
        pending={voidSession.isPending}
        onConfirm={(reason) => voiding && voidSession.mutate({ sessionId: voiding.id, input: { reason: reason ?? "" } }, { onSuccess: () => setVoiding(null) })}
      />
    </SectionCard>
  )
}
