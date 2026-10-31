"use client"

import { CalendarClock, DoorOpen, Repeat, Stethoscope, User as UserIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { availableTransitions, isTerminal, TRANSITION_ACTION_LABELS } from "@/domain/appointment-status"
import { can } from "@/domain/permissions"
import type { Appointment, AppointmentStatus } from "@/domain/types"
import { formatDateLong, formatDateTime, formatTime } from "@/shared/lib/format"
import { useCurrentUser } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { ProDot } from "@/shared/ui/atoms/pro-color"
import { StatusBadge } from "@/shared/ui/atoms/status-badge"
import { EntityActionsButton, EntityMenu } from "@/shared/ui/entity-menu"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"

import { useAppointmentActionsFor } from "../lib/use-appointment-actions"
import { useChangeStatus, useSettings } from "../queries"

export function AppointmentDetailSheet({
  appointment,
  onOpenChange,
  onReschedule,
}: {
  appointment?: Appointment
  onOpenChange: (open: boolean) => void
  onReschedule: (appointment: Appointment) => void
}) {
  return (
    <Sheet open={!!appointment} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        {appointment && <Detail appointment={appointment} onClose={() => onOpenChange(false)} onReschedule={onReschedule} />}
      </SheetContent>
    </Sheet>
  )
}

function Detail({ appointment, onClose, onReschedule }: { appointment: Appointment; onClose: () => void; onReschedule: (a: Appointment) => void }) {
  const { user } = useCurrentUser()
  const lookups = useLookups()
  const settings = useSettings()
  const changeStatus = useChangeStatus()
  const [cancelOpen, setCancelOpen] = useState(false)
  // O mesmo menu do clique direito na agenda; "Ver detalhes" não aparece aqui porque o painel já está aberto.
  const actionsFor = useAppointmentActionsFor({ onReschedule })

  const professional = lookups.professional.get(appointment.professionalId)
  const patient = appointment.patientId ? lookups.patient.get(appointment.patientId) : undefined
  const service = appointment.serviceId ? lookups.service.get(appointment.serviceId) : undefined
  const room = appointment.roomId ? lookups.room.get(appointment.roomId) : undefined
  const isBlock = appointment.kind === "block"

  const transitions = availableTransitions(user, appointment)
  const forward = transitions.filter((t) => t !== "cancelled")
  const canCancel = transitions.includes("cancelled")
  const canEdit = can(user, "appointments:write") && !isTerminal(appointment.status) && appointment.status !== "in_progress"

  // Otimista: a agenda já mostra o novo status; o cancelamento fecha diálogo e painel na hora.
  // Se o servidor recusar a transição, o cache volta ao snapshot e o toast explica o motivo.
  const move = (to: AppointmentStatus, reason?: string) => {
    changeStatus.mutate({ id: appointment.id, to, reason })
    setCancelOpen(false)
    if (to === "cancelled") onClose()
  }

  const rows = [
    { icon: CalendarClock, label: "Quando", value: `${formatDateLong(appointment.start)}, ${formatTime(appointment.start)}–${formatTime(appointment.end)}` },
    {
      icon: Stethoscope,
      label: "Profissional",
      value: professional ? (
        <span className="flex items-center gap-2">
          <ProDot colorIndex={professional.colorIndex} />
          {professional.name}
        </span>
      ) : (
        "—"
      ),
    },
    ...(service ? [{ icon: Stethoscope, label: "Serviço", value: `${service.name} · ${service.durationMin} min` }] : []),
    { icon: DoorOpen, label: "Sala", value: room?.name ?? "Sem sala" },
    ...(appointment.recurrenceGroupId ? [{ icon: Repeat, label: "Recorrência", value: "Faz parte de uma série semanal" }] : []),
  ]

  return (
    <>
      <SheetHeader className="gap-2">
        <div className="flex items-center gap-2">
          {isBlock ? <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Bloqueio de agenda</span> : <StatusBadge status={appointment.status} />}
          <EntityMenu actions={actionsFor(appointment)}>
            <EntityActionsButton label="Mais ações do agendamento" size="icon-xs" className="ml-auto" />
          </EntityMenu>
        </div>
        <SheetTitle className="text-xl text-balance">{isBlock ? appointment.title : (patient?.socialName ?? patient?.fullName ?? "Paciente")}</SheetTitle>
        <SheetDescription>
          {patient ? (
            <Link href={`/pacientes/${patient.id}`} className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline">
              <UserIcon className="size-3.5" aria-hidden />
              Ver ficha · {patient.code}
            </Link>
          ) : (
            "Horário indisponível para atendimentos."
          )}
        </SheetDescription>
      </SheetHeader>

      <SheetBody>
        <dl className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[1.25rem_6rem_1fr] items-start gap-2 text-sm">
              <row.icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>

        {appointment.notes && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-foreground">{appointment.notes}</div>
        )}

        {appointment.status === "cancelled" && (
          <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm leading-relaxed text-danger-foreground">
            <p className="font-medium">Cancelado {appointment.cancelledAt ? `em ${formatDateTime(appointment.cancelledAt)}` : ""}</p>
            {appointment.cancelReason && <p className="opacity-85">{appointment.cancelReason}</p>}
          </div>
        )}

        {!isBlock && forward.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Próximo passo</p>
            <div className="flex flex-wrap gap-2">
              {forward.map((to, i) => (
                <Button key={to} size="sm" variant={i === 0 ? "default" : "outline"} disabled={changeStatus.isPending} onClick={() => move(to)}>
                  {TRANSITION_ACTION_LABELS[to]}
                </Button>
              ))}
            </div>
          </div>
        )}
      </SheetBody>

      {(canEdit || canCancel) && (
        <SheetFooter className="justify-between">
          {canCancel ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
              {isBlock ? "Remover bloqueio" : "Cancelar atendimento"}
            </Button>
          ) : (
            <span />
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => onReschedule(appointment)}>
              {isBlock ? "Editar" : "Reagendar"}
            </Button>
          )}
        </SheetFooter>
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={isBlock ? "Remover bloqueio?" : "Cancelar atendimento?"}
        description="O horário volta a ficar livre na agenda. A ação fica registrada na auditoria."
        confirmLabel="Confirmar cancelamento"
        destructive
        reason={{ label: "Motivo", required: settings.data?.requireCancelReason ?? true }}
        pending={changeStatus.isPending}
        onConfirm={(reason) => move("cancelled", reason)}
      />
    </>
  )
}
