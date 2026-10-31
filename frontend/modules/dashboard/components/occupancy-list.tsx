import type { DashboardSummary } from "@/shared/api/api"
import { formatDuration } from "@/shared/lib/format"
import { PRO_BG } from "@/shared/ui/atoms/pro-color"
import { cn } from "@/lib/utils"

export function OccupancyList({ items }: { items: DashboardSummary["occupancy"] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Sem profissionais com grade cadastrada.</p>

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.professionalId} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{item.name}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
              {formatDuration(item.booked)} / {formatDuration(item.capacity)}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label={`Ocupação de ${item.name}`}
            aria-valuenow={item.rate}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn("h-full rounded-full transition-[width] duration-700", PRO_BG[item.colorIndex % PRO_BG.length])}
              style={{ width: `${Math.min(item.rate, 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
