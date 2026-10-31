import { STATUS_LABELS } from "@/domain/appointment-status"
import type { AppointmentStatus } from "@/domain/types"
import { cn } from "@/lib/utils"

export const STATUS_DOT: Record<AppointmentStatus, string> = {
  requested: "bg-status-requested",
  pending: "bg-status-pending",
  confirmed: "bg-status-confirmed",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  cancelled: "bg-status-cancelled",
  no_show: "bg-status-no-show",
}

/** Fundo suave + texto escuro/claro por tema; o rótulo sempre acompanha a cor. */
const STATUS_TONE: Record<AppointmentStatus, string> = {
  requested: "bg-status-requested-soft text-status-requested-fg",
  pending: "bg-status-pending-soft text-status-pending-fg",
  confirmed: "bg-status-confirmed-soft text-status-confirmed-fg",
  in_progress: "bg-status-in-progress-soft text-status-in-progress-fg",
  completed: "bg-status-completed-soft text-status-completed-fg",
  cancelled: "bg-status-cancelled-soft text-status-cancelled-fg",
  no_show: "bg-status-no-show-soft text-status-no-show-fg",
}

export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-xs font-medium whitespace-nowrap",
        STATUS_TONE[status],
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
      {STATUS_LABELS[status]}
    </span>
  )
}
