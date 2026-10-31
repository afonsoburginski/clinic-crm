"use client"

import { Plus, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Professional, WeeklySlot } from "@/domain/types"
import { WEEKDAY_LABELS } from "@/shared/lib/format"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { useSaveSchedule } from "../queries"

const WORK_WEEK = [1, 2, 3, 4, 5, 6]

export function ScheduleEditor({ professional, editable }: { professional: Professional; editable: boolean }) {
  const [slots, setSlots] = useState<WeeklySlot[]>(professional.schedule)
  const save = useSaveSchedule(professional.id)
  const dirty = JSON.stringify(slots) !== JSON.stringify(professional.schedule)
  const invalid = slots.some((s) => s.end <= s.start)

  const update = (index: number, patch: Partial<WeeklySlot>) =>
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  return (
    <SectionCard
      title="Grade semanal"
      description="Horários em que o profissional aceita agendamentos (fuso de São Paulo)."
      actions={
        editable && (
          <Button size="sm" disabled={!dirty || invalid || save.isPending} onClick={() => save.mutate(slots)}>
            {save.isPending ? "Salvando…" : "Salvar grade"}
          </Button>
        )
      }
    >
      <ul className="flex flex-col divide-y">
        {WORK_WEEK.map((weekday) => {
          const daySlots = slots.map((s, index) => ({ s, index })).filter(({ s }) => s.weekday === weekday)
          return (
            <li key={weekday} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
              <span className="w-24 shrink-0 pt-1.5 text-sm font-medium">{WEEKDAY_LABELS[weekday]}</span>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {daySlots.length === 0 && <span className="pt-1.5 text-sm text-muted-foreground">Sem atendimento</span>}
                {daySlots.map(({ s, index }) => (
                  <div key={index} className="flex items-center gap-1 rounded-lg border bg-background px-1.5 py-1">
                    <Input
                      type="time"
                      aria-label={`Início ${WEEKDAY_LABELS[weekday]}`}
                      value={s.start}
                      disabled={!editable}
                      onChange={(e) => update(index, { start: e.target.value })}
                      className="h-7 w-24 border-0 px-1 shadow-none"
                    />
                    <span className="text-muted-foreground" aria-hidden>
                      –
                    </span>
                    <Input
                      type="time"
                      aria-label={`Término ${WEEKDAY_LABELS[weekday]}`}
                      value={s.end}
                      disabled={!editable}
                      aria-invalid={s.end <= s.start || undefined}
                      onChange={(e) => update(index, { end: e.target.value })}
                      className="h-7 w-24 border-0 px-1 shadow-none"
                    />
                    {editable && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remover faixa"
                        onClick={() => setSlots((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <X aria-hidden />
                      </Button>
                    )}
                  </div>
                ))}
                {editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSlots((prev) => [...prev, { weekday, start: "08:00", end: "12:00" }])}
                  >
                    <Plus data-icon="inline-start" aria-hidden />
                    Faixa
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {invalid && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          Há faixas com término antes do início.
        </p>
      )}
    </SectionCard>
  )
}
