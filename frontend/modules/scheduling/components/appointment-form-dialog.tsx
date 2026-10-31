"use client"

import { AlertTriangle, Sparkles } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { clinicDateKey, clinicDateTimeToISO, clinicTimeKey, toMinutes } from "@/domain/clinic-time"
import { ConflictError, type ConflictDetail } from "@/domain/errors"
import type { AppointmentInput } from "@/domain/schemas"
import type { Appointment } from "@/domain/types"
import { useLookups } from "@/shared/lib/lookups"
import { notifyError } from "@/shared/lib/notify"
import { FormField } from "@/shared/ui/molecules/form-field"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { minutesToTime } from "../lib/calendar"
import { useSaveAppointment } from "../queries"

export interface AppointmentDraft {
  date: string
  start: string
  professionalId?: string
  patientId?: string
}

interface FormState {
  kind: "appointment" | "block"
  title: string
  patientId: string
  serviceId: string
  professionalId: string
  roomId: string
  date: string
  start: string
  end: string
  status: "requested" | "pending" | "confirmed"
  recurrenceWeeks: string
  notes: string
}

const NO_ROOM = "none"

function initialState(appointment?: Appointment, draft?: AppointmentDraft): FormState {
  if (appointment) {
    return {
      kind: appointment.kind,
      title: appointment.title ?? "",
      patientId: appointment.patientId ?? "",
      serviceId: appointment.serviceId ?? "",
      professionalId: appointment.professionalId,
      roomId: appointment.roomId ?? NO_ROOM,
      date: clinicDateKey(appointment.start),
      start: clinicTimeKey(appointment.start),
      end: clinicTimeKey(appointment.end),
      status: "confirmed",
      recurrenceWeeks: "1",
      notes: appointment.notes ?? "",
    }
  }
  const start = draft?.start ?? "09:00"
  return {
    kind: "appointment",
    title: "",
    patientId: draft?.patientId ?? "",
    serviceId: "",
    professionalId: draft?.professionalId ?? "",
    roomId: NO_ROOM,
    date: draft?.date ?? "",
    start,
    end: minutesToTime(toMinutes(start) + 50),
    status: "confirmed",
    recurrenceWeeks: "1",
    notes: "",
  }
}

export function AppointmentFormDialog({
  open,
  onOpenChange,
  appointment,
  draft,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointment?: Appointment
  draft?: AppointmentDraft
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        {open && (
          <AppointmentForm
            key={appointment?.id ?? `${draft?.date}-${draft?.start}`}
            appointment={appointment}
            draft={draft}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AppointmentForm({ appointment, draft, onDone }: { appointment?: Appointment; draft?: AppointmentDraft; onDone: () => void }) {
  const lookups = useLookups()
  const save = useSaveAppointment(appointment?.id)
  const [form, setForm] = useState(() => initialState(appointment, draft))
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [conflict, setConflict] = useState<{ message: string; conflicts: ConflictDetail[]; suggestion?: { start: string; end: string } }>()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
    setConflict(undefined)
  }

  const isBlock = form.kind === "block"
  const selectedProfessional = lookups.professional.get(form.professionalId)
  const service = lookups.service.get(form.serviceId)
  const services = lookups.services.filter(
    (s) => s.active && (!selectedProfessional || selectedProfessional.specialtyIds.includes(s.specialtyId))
  )

  const chooseService = (serviceId: string) => {
    const next = lookups.service.get(serviceId)
    setForm((f) => ({ ...f, serviceId, end: next ? minutesToTime(toMinutes(f.start) + next.durationMin) : f.end }))
    setErrors((e) => ({ ...e, serviceId: undefined, roomId: undefined }))
    setConflict(undefined)
  }

  const chooseStart = (start: string) => {
    const duration = toMinutes(form.end) - toMinutes(form.start)
    setForm((f) => ({ ...f, start, end: start ? minutesToTime(toMinutes(start) + Math.max(duration, 15)) : f.end }))
    setConflict(undefined)
  }

  const validate = () => {
    const next: typeof errors = {}
    if (!form.professionalId) next.professionalId = "Selecione o profissional."
    if (!form.date) next.date = "Informe a data."
    if (!form.start) next.start = "Informe o início."
    if (!form.end || toMinutes(form.end) <= toMinutes(form.start)) next.end = "O término deve ser após o início."
    if (isBlock) {
      if (form.title.trim().length < 3) next.title = "Descreva o motivo do bloqueio."
    } else {
      if (!form.patientId) next.patientId = "Selecione o paciente."
      if (!form.serviceId) next.serviceId = "Selecione o serviço."
      if (service?.requiresRoom && form.roomId === NO_ROOM) next.roomId = "Este serviço exige sala."
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = (override?: { start: string; end: string }) => {
    if (!override && !validate()) return
    const input: AppointmentInput = {
      kind: form.kind,
      title: isBlock ? form.title : undefined,
      patientId: isBlock ? undefined : form.patientId,
      serviceId: isBlock ? undefined : form.serviceId,
      professionalId: form.professionalId,
      roomId: form.roomId === NO_ROOM ? undefined : form.roomId,
      start: override?.start ?? clinicDateTimeToISO(form.date, form.start),
      end: override?.end ?? clinicDateTimeToISO(form.date, form.end),
      notes: form.notes,
      status: appointment ? undefined : form.status,
      recurrenceWeeks: appointment ? undefined : Number(form.recurrenceWeeks),
    }
    save.mutate(input, {
      onSuccess: onDone,
      onError: (error) => {
        if (error instanceof ConflictError) {
          setConflict({ message: error.message, conflicts: error.conflicts, suggestion: error.suggestion })
        } else {
          notifyError(error)
        }
      },
    })
  }

  const applySuggestion = (suggestion: { start: string; end: string }) => {
    setForm((f) => ({ ...f, date: clinicDateKey(suggestion.start), start: clinicTimeKey(suggestion.start), end: clinicTimeKey(suggestion.end) }))
    setConflict(undefined)
    submit(suggestion)
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{appointment ? "Reagendar" : "Novo agendamento"}</DialogTitle>
        <DialogDescription>Conflitos de profissional, sala e expediente são verificados ao salvar.</DialogDescription>
      </DialogHeader>

      {!appointment && (
        <HaloToggleGroup
          items={[
            { value: "appointment", label: "Atendimento" },
            { value: "block", label: "Bloqueio" },
          ]}
          value={form.kind}
          onValueChange={(v) => set("kind", v as FormState["kind"])}
          className="self-start"
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {isBlock ? (
          <FormField id="ap-title" label="Motivo do bloqueio" required error={errors.title} className="sm:col-span-2">
            <Input id="ap-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: Supervisão clínica" aria-invalid={!!errors.title} />
          </FormField>
        ) : (
          <FormField id="ap-patient" label="Paciente" required error={errors.patientId} className="sm:col-span-2">
            <SimpleSelect
              id="ap-patient"
              value={form.patientId}
              onChange={(v) => set("patientId", v)}
              invalid={!!errors.patientId}
              placeholder="Selecione o paciente"
              options={lookups.patients
                .filter((p) => p.status === "active" || p.id === form.patientId)
                .map((p) => ({ value: p.id, label: `${p.socialName ?? p.fullName} · ${p.code}` }))}
            />
          </FormField>
        )}

        <FormField id="ap-professional" label="Profissional" required error={errors.professionalId}>
          <SimpleSelect
            id="ap-professional"
            value={form.professionalId}
            onChange={(v) => set("professionalId", v)}
            invalid={!!errors.professionalId}
            options={lookups.professionals.filter((p) => p.active || p.id === form.professionalId).map((p) => ({ value: p.id, label: p.name }))}
          />
        </FormField>

        {!isBlock && (
          <FormField id="ap-service" label="Serviço" required error={errors.serviceId}>
            <SimpleSelect
              id="ap-service"
              value={form.serviceId}
              onChange={chooseService}
              invalid={!!errors.serviceId}
              placeholder={selectedProfessional ? "Selecione" : "Escolha o profissional"}
              options={services.map((s) => ({ value: s.id, label: `${s.name} · ${s.durationMin} min` }))}
            />
          </FormField>
        )}

        <FormField id="ap-date" label="Data" required error={errors.date}>
          <Input id="ap-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} aria-invalid={!!errors.date} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField id="ap-start" label="Início" required error={errors.start}>
            <Input id="ap-start" type="time" step={300} value={form.start} onChange={(e) => chooseStart(e.target.value)} aria-invalid={!!errors.start} />
          </FormField>
          <FormField id="ap-end" label="Término" required error={errors.end}>
            <Input id="ap-end" type="time" step={300} value={form.end} onChange={(e) => set("end", e.target.value)} aria-invalid={!!errors.end} />
          </FormField>
        </div>

        <FormField id="ap-room" label="Sala" error={errors.roomId} hint={service?.requiresRoom ? "Obrigatória para este serviço." : undefined}>
          <SimpleSelect
            id="ap-room"
            value={form.roomId}
            onChange={(v) => set("roomId", v)}
            invalid={!!errors.roomId}
            options={[
              { value: NO_ROOM, label: "Sem sala" },
              ...lookups.rooms.filter((r) => r.active || r.id === form.roomId).map((r) => ({ value: r.id, label: r.name })),
            ]}
          />
        </FormField>

        {!appointment && (
          <FormField id="ap-recurrence" label="Repetir semanalmente">
            <SimpleSelect
              id="ap-recurrence"
              value={form.recurrenceWeeks}
              onChange={(v) => set("recurrenceWeeks", v)}
              options={[1, 2, 4, 8, 12].map((n) => ({ value: String(n), label: n === 1 ? "Não repetir" : `${n} semanas` }))}
            />
          </FormField>
        )}

        {!appointment && !isBlock && (
          <FormField id="ap-status" label="Status inicial">
            <SimpleSelect
              id="ap-status"
              value={form.status}
              onChange={(v) => set("status", v as FormState["status"])}
              options={[
                { value: "confirmed", label: "Confirmado" },
                { value: "pending", label: "Pendente" },
                { value: "requested", label: "Solicitado" },
              ]}
            />
          </FormField>
        )}

        <FormField id="ap-notes" label="Observações" className="sm:col-span-2">
          <Textarea id="ap-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </FormField>
      </div>

      {conflict && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle className="size-4 text-destructive" aria-hidden />
            {conflict.message}
          </p>
          <ul className="flex flex-col gap-1 pl-6 text-sm text-muted-foreground">
            {conflict.conflicts.map((c, i) => (
              <li key={i} className="list-disc">
                {c.message}
              </li>
            ))}
          </ul>
          {conflict.suggestion && (
            <Button type="button" variant="outline" size="sm" className="self-start" disabled={save.isPending} onClick={() => applySuggestion(conflict.suggestion!)}>
              <Sparkles aria-hidden />
              Usar próximo horário livre: {clinicDateKey(conflict.suggestion.start).split("-").reverse().slice(0, 2).join("/")} às {clinicTimeKey(conflict.suggestion.start)}
            </Button>
          )}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Salvando…" : appointment ? "Salvar alterações" : "Agendar"}
        </Button>
      </DialogFooter>
    </form>
  )
}
