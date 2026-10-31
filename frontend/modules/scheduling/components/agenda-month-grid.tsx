"use client"

import { Ban } from "lucide-react"
import { useMemo } from "react"

import { clinicDateKey } from "@/domain/clinic-time"
import type { Appointment } from "@/domain/types"
import { cn } from "@/lib/utils"
import { formatTime, WEEKDAY_SHORT } from "@/shared/lib/format"
import { ProDot } from "@/shared/ui/atoms/pro-color"

import { todayKey } from "../lib/calendar"
import { useAppointmentLabels } from "./appointment-line"

const MAX_PER_DAY = 3

export function AgendaMonthGrid({
  weeks,
  monthKey,
  appointments,
  onSelect,
  onOpenDay,
}: {
  weeks: string[][]
  monthKey: string
  appointments: Appointment[]
  onSelect: (a: Appointment) => void
  onOpenDay: (dateKey: string) => void
}) {
  const labels = useAppointmentLabels()
  const today = todayKey()
  const month = monthKey.slice(0, 7)

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const a of [...appointments].sort((x, y) => x.start.localeCompare(y.start))) {
      const key = clinicDateKey(new Date(a.start))
      map.set(key, [...(map.get(key) ?? []), a])
    }
    return map
  }, [appointments])

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="grid min-w-[720px] grid-cols-6" role="grid" aria-label="Agenda do mês">
        <div className="contents" role="row">
          {weeks[0].map((key) => (
            <div
              key={key}
              role="columnheader"
              className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {WEEKDAY_SHORT[new Date(`${key}T12:00:00Z`).getUTCDay()]}
            </div>
          ))}
        </div>

        {weeks.map((week) => (
          <div className="contents" role="row" key={week[0]}>
            {week.map((key) => {
              const items = byDay.get(key) ?? []
              const outside = !key.startsWith(month)
              const isToday = key === today
              const hidden = items.length - MAX_PER_DAY
              return (
                <div
                  key={key}
                  role="gridcell"
                  className={cn(
                    "flex min-h-32 flex-col gap-1 border-b border-r border-border p-1.5 last:border-r-0 [&:nth-child(6n)]:border-r-0",
                    outside && "bg-muted/40"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpenDay(key)}
                    aria-label={`Abrir ${key.split("-").reverse().join("/")} na visão de dia${items.length ? `, ${items.length} itens` : ""}`}
                    className={cn(
                      "flex size-7 items-center justify-center self-start rounded-full font-mono text-xs tabular-nums transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      outside ? "text-muted-foreground" : "text-foreground",
                      isToday && "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    {Number(key.slice(8))}
                  </button>

                  <ul className="flex flex-col gap-0.5">
                    {items.slice(0, MAX_PER_DAY).map((a) => {
                      const pro = labels.professional.get(a.professionalId)
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => onSelect(a)}
                            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {a.kind === "block" ? (
                              <Ban className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                            ) : (
                              pro && <ProDot colorIndex={pro.colorIndex} />
                            )}
                            <span className="font-mono tabular-nums text-muted-foreground">{formatTime(a.start)}</span>
                            <span className="truncate text-foreground">{labels.titleOf(a)}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenDay(key)}
                      className="self-start rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      +{hidden} {hidden === 1 ? "item" : "itens"}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
