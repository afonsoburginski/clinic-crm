"use client"

import { Lock } from "lucide-react"
import { useEffect, useState } from "react"

import { clinicDateKey, clinicTimeKey, toMinutes } from "@/domain/clinic-time"
import { INACTIVE_STATUSES } from "@/domain/appointment-status"
import type { Appointment } from "@/domain/types"
import { cn } from "@/lib/utils"
import { useLookups } from "@/shared/lib/lookups"
import { PRO_SURFACE } from "@/shared/ui/atoms/pro-color"
import { STATUS_DOT } from "@/shared/ui/atoms/status-badge"

import { dayLabel, layoutDay, minutesToTime, todayKey } from "../lib/calendar"

export const GRID_START_HOUR = 7
export const GRID_END_HOUR = 21
const HOUR_PX = 64
const MINUTE_PX = HOUR_PX / 60
const HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i)

function useNowMinutes() {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(toMinutes(clinicTimeKey(new Date())))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function AgendaGrid({
  days,
  appointments,
  onSelect,
  onCreateAt,
}: {
  days: string[]
  appointments: Appointment[]
  onSelect: (appointment: Appointment) => void
  onCreateAt?: (dateKey: string, time: string) => void
}) {
  const nowMinutes = useNowMinutes()
  const today = todayKey()
  const byDay = new Map<string, Appointment[]>(days.map((d) => [d, []]))
  for (const a of appointments) byDay.get(clinicDateKey(a.start))?.push(a)

  const columns = `3.5rem repeat(${days.length}, minmax(${days.length > 1 ? "8.5rem" : "0"}, 1fr))`

  return (
    <div className="overflow-auto rounded-xl border border-border bg-card">
      <div className="min-w-fit">
        <div className="sticky top-0 z-20 grid border-b border-border bg-card/95 backdrop-blur" style={{ gridTemplateColumns: columns }}>
          <div aria-hidden />
          {days.map((key) => {
            const { weekday, date } = dayLabel(key)
            const isToday = key === today
            return (
              <div key={key} className="flex items-baseline gap-2 border-l border-border px-3 py-2.5">
                <span className={cn("text-xs uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground")}>{weekday}</span>
                <span
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    isToday ? "rounded-md bg-primary px-1.5 text-primary-foreground" : "text-foreground"
                  )}
                >
                  {date}
                </span>
              </div>
            )
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: columns }}>
          <div className="relative" style={{ height: HOURS.length * HOUR_PX }}>
            {HOURS.map((h, i) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-muted-foreground"
                style={{ top: i * HOUR_PX }}
              >
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>

          {days.map((key) => (
            <DayColumn
              key={key}
              dateKey={key}
              appointments={byDay.get(key) ?? []}
              nowMinutes={key === today ? nowMinutes : null}
              onSelect={onSelect}
              onCreateAt={onCreateAt}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  dateKey,
  appointments,
  nowMinutes,
  onSelect,
  onCreateAt,
}: {
  dateKey: string
  appointments: Appointment[]
  nowMinutes: number | null
  onSelect: (appointment: Appointment) => void
  onCreateAt?: (dateKey: string, time: string) => void
}) {
  const gridStart = GRID_START_HOUR * 60
  const gridEnd = GRID_END_HOUR * 60
  const positioned = layoutDay(appointments)

  return (
    <div
      className={cn("relative border-l border-border", onCreateAt && "cursor-cell")}
      style={{ height: HOURS.length * HOUR_PX }}
      onClick={(event) => {
        if (!onCreateAt || event.target !== event.currentTarget) return
        const offset = event.clientY - event.currentTarget.getBoundingClientRect().top
        const minutes = gridStart + Math.floor(offset / MINUTE_PX / 30) * 30
        onCreateAt(dateKey, minutesToTime(Math.min(minutes, gridEnd - 30)))
      }}
    >
      {HOURS.map((h, i) => (
        <div key={h} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_PX }}>
          <div className="border-t border-dashed border-border/30" style={{ marginTop: HOUR_PX / 2 - 1 }} />
        </div>
      ))}

      {nowMinutes !== null && nowMinutes >= gridStart && nowMinutes <= gridEnd && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
          style={{ top: (nowMinutes - gridStart) * MINUTE_PX }}
        >
          <span className="-ml-1 size-2 rounded-full bg-primary" />
          <span className="h-px flex-1 bg-primary" />
        </div>
      )}

      {positioned.map((item) => {
        const top = (Math.max(item.startMin, gridStart) - gridStart) * MINUTE_PX
        const height = Math.max((Math.min(item.endMin, gridEnd) - Math.max(item.startMin, gridStart)) * MINUTE_PX - 2, 18)
        return (
          <AppointmentBlock
            key={item.appointment.id}
            appointment={item.appointment}
            style={{
              top,
              height,
              left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
              width: `calc(${100 / item.lanes}% - 4px)`,
            }}
            compact={height < 40}
            onSelect={onSelect}
          />
        )
      })}
    </div>
  )
}

function AppointmentBlock({
  appointment,
  style,
  compact,
  onSelect,
}: {
  appointment: Appointment
  style: React.CSSProperties
  compact: boolean
  onSelect: (appointment: Appointment) => void
}) {
  const lookups = useLookups()
  const professional = lookups.professional.get(appointment.professionalId)
  const patient = appointment.patientId ? lookups.patient.get(appointment.patientId) : undefined
  const service = appointment.serviceId ? lookups.service.get(appointment.serviceId) : undefined
  const isBlock = appointment.kind === "block"
  const inactive = INACTIVE_STATUSES.includes(appointment.status)
  const time = `${clinicTimeKey(appointment.start)}–${clinicTimeKey(appointment.end)}`
  const title = isBlock ? appointment.title : (patient?.socialName ?? patient?.fullName ?? "Paciente")

  return (
    <button
      type="button"
      onClick={() => onSelect(appointment)}
      style={style}
      aria-label={`${title}, ${time}${service ? `, ${service.name}` : ""}${professional ? `, ${professional.name}` : ""}`}
      className={cn(
        "absolute z-[5] flex flex-col overflow-hidden rounded-md px-2 py-1 text-left ring-1 ring-inset transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring",
        isBlock
          ? "bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)] text-muted-foreground ring-border"
          : PRO_SURFACE[(professional?.colorIndex ?? 0) % 6],
        inactive && "opacity-45"
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {isBlock ? (
          <Lock className="size-3 shrink-0" aria-hidden />
        ) : (
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[appointment.status])} />
        )}
        <span className={cn("truncate text-xs font-medium text-foreground", inactive && "line-through")}>{title}</span>
        {compact && <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{clinicTimeKey(appointment.start)}</span>}
      </span>
      {!compact && (
        <>
          <span className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">{time}</span>
          {service && <span className="truncate text-[11px] text-muted-foreground">{service.name}</span>}
        </>
      )}
    </button>
  )
}
