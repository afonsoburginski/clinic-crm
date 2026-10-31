"use client"

import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { INACTIVE_STATUSES } from "@/domain/appointment-status"
import { can } from "@/domain/permissions"
import type { Appointment } from "@/domain/types"
import { useCurrentUser } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { ProDot } from "@/shared/ui/atoms/pro-color"
import { ErrorState } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

import { addDays, addMonths, dayKeys, monthLabel, monthWeeks, rangeISO, rangeLabel, startOfWeek, todayKey } from "../lib/calendar"
import { consumeAppointmentLink } from "../lib/appointment-link"
import { useAppointmentActionsFor } from "../lib/use-appointment-actions"
import { useAppointments } from "../queries"
import { AgendaGrid } from "./agenda-grid"
import { AgendaMonthGrid } from "./agenda-month-grid"
import { AppointmentDetailSheet } from "./appointment-detail-sheet"
import { AppointmentFormDialog, type AppointmentDraft } from "./appointment-form-dialog"

type ViewMode = "day" | "week" | "month"
const ALL = "all"

export function AgendaView() {
  const { user } = useCurrentUser()
  const lookups = useLookups()
  const [mode, setMode] = useState<ViewMode>("week")
  const [anchor, setAnchor] = useState(todayKey)
  const [professionalId, setProfessionalId] = useState(ALL)
  const [roomId, setRoomId] = useState(ALL)
  const [showInactive, setShowInactive] = useState(false)
  const [selected, setSelected] = useState<Appointment>()
  const [form, setForm] = useState<{ open: boolean; appointment?: Appointment; draft?: AppointmentDraft }>({ open: false })

  const canWrite = can(user, "appointments:write")
  useEffect(() => {
    if (!user) return
    const request = consumeAppointmentLink(new URL(window.location.href))
    if (!request) return
    window.history.replaceState(window.history.state, "", request.nextUrl)
    if (can(user, "appointments:write")) {
      setForm({ open: true, draft: { date: todayKey(), start: "09:00", patientId: request.patientId } })
    }
  }, [user])

  const ownOnly = !can(user, "appointments:read")
  const weeks = mode === "month" ? monthWeeks(anchor) : []
  const days = mode === "week" ? dayKeys(startOfWeek(anchor), 6) : mode === "month" ? weeks.flat() : [anchor]
  const range = rangeISO(days[0], mode === "month" ? weeks.length * 7 : days.length)

  const filters = useMemo(
    () => ({
      ...range,
      professionalIds: professionalId === ALL ? undefined : [professionalId],
      roomId: roomId === ALL ? undefined : roomId,
    }),
    [range.from, range.to, professionalId, roomId] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const query = useAppointments(filters)
  const openReschedule = (appointment: Appointment) => {
    setSelected(undefined)
    setForm({ open: true, appointment })
  }
  const actionsFor = useAppointmentActionsFor({ onView: setSelected, onReschedule: openReschedule })
  const appointments = (query.data ?? []).filter((a) => showInactive || !INACTIVE_STATUSES.includes(a.status))
  const visibleProfessionals = lookups.professionals.filter((p) => p.active && (!ownOnly || p.id === user?.professionalId))

  const shift = (direction: 1 | -1) =>
    setAnchor((a) => (mode === "month" ? addMonths(a, direction) : addDays(a, direction * (mode === "week" ? 7 : 1))))
  const openCreate = (draft?: AppointmentDraft) =>
    setForm({
      open: true,
      draft: { date: draft?.date ?? anchor, start: draft?.start ?? "09:00", professionalId: draft?.professionalId ?? (professionalId === ALL ? undefined : professionalId), patientId: draft?.patientId },
    })

  return (
    <>
      <PageHeader
        title="Agenda"
        description={ownOnly ? "Seus atendimentos e bloqueios." : "Atendimentos de toda a equipe, com conflitos verificados em tempo real."}
        actions={
          canWrite && (
            <Button onClick={() => openCreate()}>
              <Plus aria-hidden />
              Novo agendamento
            </Button>
          )
        }
      />

      <Toolbar variant="bar" label="Período e filtros da agenda">
        <ToolbarGroup>
          <div role="group" aria-label="Período" className="flex h-(--control-h) items-stretch overflow-hidden rounded-lg border border-input">
            <Button variant="ghost" size="sm" className="h-full w-9 rounded-none px-0" aria-label="Período anterior" onClick={() => shift(-1)}>
              <ChevronLeft aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" className="h-full rounded-none border-x border-input px-3" onClick={() => setAnchor(todayKey())}>
              Hoje
            </Button>
            <Button variant="ghost" size="sm" className="h-full w-9 rounded-none px-0" aria-label="Próximo período" onClick={() => shift(1)}>
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <h2 className="text-base font-medium capitalize text-foreground" aria-live="polite">
            {mode === "month" ? monthLabel(anchor) : rangeLabel(days)}
          </h2>
          {query.isFetching && <span className="text-xs text-muted-foreground">Atualizando…</span>}
        </ToolbarGroup>

        <ToolbarGroup align="end">
          <HaloToggleGroup
            items={[
              { value: "day", label: "Dia" },
              { value: "week", label: "Semana" },
              { value: "month", label: "Mês" },
            ]}
            value={mode}
            onValueChange={(v) => setMode(v as ViewMode)}
          />
          {!ownOnly && (
            <SimpleSelect
              ariaLabel="Filtrar por profissional"
              className="w-48"
              value={professionalId}
              onChange={setProfessionalId}
              options={[{ value: ALL, label: "Todos os profissionais" }, ...visibleProfessionals.map((p) => ({ value: p.id, label: p.name }))]}
            />
          )}
          <SimpleSelect
            ariaLabel="Filtrar por sala"
            className="w-40"
            value={roomId}
            onChange={setRoomId}
            options={[{ value: ALL, label: "Todas as salas" }, ...lookups.rooms.filter((r) => r.active).map((r) => ({ value: r.id, label: r.name }))]}
          />
          <div className="flex h-(--control-h) items-center gap-2">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive" className="text-sm text-muted-foreground">
              Cancelados e faltas
            </Label>
          </div>
        </ToolbarGroup>
      </Toolbar>

      {!ownOnly && professionalId === ALL && visibleProfessionals.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legenda de profissionais">
          {visibleProfessionals.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setProfessionalId(p.id)}
              >
                <ProDot colorIndex={p.colorIndex} />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : mode === "month" ? (
        <AgendaMonthGrid
          weeks={weeks}
          monthKey={anchor}
          appointments={appointments}
          onSelect={setSelected}
          actionsFor={actionsFor}
          onOpenDay={(key) => {
            setAnchor(key)
            setMode("day")
          }}
        />
      ) : (
        <AgendaGrid
          days={days}
          appointments={appointments}
          onSelect={setSelected}
          actionsFor={actionsFor}
          onCreateAt={canWrite ? (date, start) => openCreate({ date, start }) : undefined}
        />
      )}

      <AppointmentDetailSheet
        appointment={selected && (query.data?.find((a) => a.id === selected.id) ?? selected)}
        onOpenChange={(open) => !open && setSelected(undefined)}
        onReschedule={openReschedule}
      />
      <AppointmentFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        appointment={form.appointment}
        draft={form.draft}
      />
    </>
  )
}
