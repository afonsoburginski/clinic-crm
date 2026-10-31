"use client"

import { Ban } from "lucide-react"

import type { Appointment } from "@/domain/types"
import { cn } from "@/lib/utils"
import { formatTime, relativeDayLabel } from "@/shared/lib/format"
import { useLookups } from "@/shared/lib/lookups"
import { ProDot } from "@/shared/ui/atoms/pro-color"
import { StatusBadge } from "@/shared/ui/atoms/status-badge"

export function useAppointmentLabels() {
  const lookups = useLookups()
  return {
    ...lookups,
    titleOf(a: Appointment) {
      if (a.kind === "block") return a.title ?? "Bloqueio"
      const p = a.patientId ? lookups.patient.get(a.patientId) : undefined
      return p ? p.socialName || p.fullName : "Paciente"
    },
  }
}

export function AppointmentLine({
  appointment,
  showDay = false,
  onSelect,
}: {
  appointment: Appointment
  showDay?: boolean
  onSelect?: (a: Appointment) => void
}) {
  const labels = useAppointmentLabels()
  const pro = labels.professional.get(appointment.professionalId)
  const service = appointment.serviceId ? labels.service.get(appointment.serviceId) : undefined
  const room = appointment.roomId ? labels.room.get(appointment.roomId) : undefined
  const Comp = onSelect ? "button" : "div"

  return (
    <Comp
      {...(onSelect ? { type: "button" as const, onClick: () => onSelect(appointment) } : {})}
      className={cn(
        "flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-left",
        onSelect && "transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      )}
    >
      <div className="flex w-16 shrink-0 flex-col">
        {showDay && <span className="text-[11px] text-muted-foreground">{relativeDayLabel(appointment.start)}</span>}
        <span className="font-mono text-sm font-medium tabular-nums">{formatTime(appointment.start)}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 truncate text-sm font-medium">
          {appointment.kind === "block" && <Ban className="size-3.5 text-muted-foreground" aria-hidden />}
          {labels.titleOf(appointment)}
        </span>
        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {pro && <ProDot colorIndex={pro.colorIndex} />}
          {[pro?.name, service?.name, room?.name].filter(Boolean).join(" · ")}
        </span>
      </div>
      {appointment.kind === "appointment" && <StatusBadge status={appointment.status} className="hidden sm:inline-flex" />}
    </Comp>
  )
}
