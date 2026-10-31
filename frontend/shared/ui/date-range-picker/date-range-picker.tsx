"use client"

import { CalendarDays, X } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { ptBR } from "react-day-picker/locale"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import {
  PRESET_IDS,
  PRESET_LABELS,
  formatRangeLabel,
  fromPickerRange,
  isEmptyRange,
  matchPreset,
  normalizeRange,
  presetRange,
  sameRange,
  todayKey,
  toPickerRange,
  ymdToDate,
  type DateRangeValue,
} from "./lib/range"
import { useMinWidth } from "./use-min-width"

export type { DateRangeValue } from "./lib/range"

const START_MONTH = new Date(2000, 0)
const END_MONTH = new Date(new Date().getFullYear() + 10, 11)

export interface DateRangePickerProps {
  /** Período em `AAAA-MM-DD`; ponta ausente = aberta. */
  value: DateRangeValue | undefined
  onChange: (value: DateRangeValue) => void
  /** Texto do gatilho sem período e nome acessível do botão (ex.: "Vencimento"). */
  label?: string
  className?: string
  disabled?: boolean
  /** Relógio injetável (testes e telas que fixam "hoje"). */
  now?: Date
  align?: "start" | "center" | "end"
}

/**
 * Seletor de período com presets, calendário de intervalo (react-day-picker v10) e Limpar/Aplicar.
 * O rascunho só vira valor ao aplicar; presets aplicam na hora. Funciona dentro de dialogs: o popover usa o
 * portal do base-ui na camada `z-60`, então clicar nele não fecha o dialog e o foco volta ao gatilho.
 */
export function DateRangePicker({ value, onChange, label = "Período", className, disabled, now, align = "start" }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRangeValue>({})
  const wide = useMinWidth(768)
  const headingId = useId()
  const today = useMemo(() => todayKey(now), [now, open]) // eslint-disable-line react-hooks/exhaustive-deps -- recalcula ao abrir (virada do dia)
  const current = normalizeRange(value)
  const active = !isEmptyRange(current)
  const activePreset = matchPreset(draft, today)

  function handleOpenChange(next: boolean) {
    if (next) setDraft(current)
    setOpen(next)
  }

  function commit(range: DateRangeValue) {
    onChange(normalizeRange(range))
    setOpen(false)
  }

  const picked = toPickerRange(draft)
  const month = ymdToDate(draft.from ?? current.from ?? today)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={active ? `${label}: ${formatRangeLabel(current)}` : label}
        className={cn(
          "inline-flex h-(--control-h) min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-muted dark:bg-input/30",
          active ? "text-foreground" : "text-muted-foreground",
          className
        )}
      >
        <CalendarDays className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{formatRangeLabel(current, label)}</span>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto max-w-[calc(100vw-1rem)] gap-0 p-0" aria-labelledby={headingId}>
        <span id={headingId} className="sr-only">
          Escolher período: {label}
        </span>
        <div className="flex flex-col md:flex-row">
          <ul className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b p-2 md:w-40 md:flex-col md:border-r md:border-b-0" aria-label="Atalhos de período">
            {PRESET_IDS.map((id) => (
              <li key={id} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={activePreset === id}
                  onClick={() => commit(presetRange(id, today))}
                  className={cn(
                    "w-full rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    activePreset === id && "bg-primary/10 font-medium text-primary"
                  )}
                >
                  {PRESET_LABELS[id]}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col">
            <Calendar
              mode="range"
              locale={ptBR}
              today={ymdToDate(today)}
              defaultMonth={month}
              numberOfMonths={wide ? 2 : 1}
              captionLayout="dropdown"
              startMonth={START_MONTH}
              endMonth={END_MONTH}
              selected={picked}
              onSelect={(range) => setDraft(fromPickerRange(range))}
              resetOnSelect
              className="p-3"
            />
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <p className="min-w-0 truncate text-xs text-muted-foreground" aria-live="polite">
                {isEmptyRange(draft) ? "Selecione o início e o fim" : formatRangeLabel(draft)}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => commit({})} disabled={!active && isEmptyRange(draft)}>
                  <X data-icon="inline-start" aria-hidden />
                  Limpar
                </Button>
                <Button type="button" size="sm" onClick={() => commit(draft)} disabled={isEmptyRange(draft) || sameRange(draft, current)}>
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
