"use client"

import { Check, ChevronDown, ListFilter } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { DateRangePicker } from "@/shared/ui/date-range-picker"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { formatMoneyInput, parseMoneyToCents } from "../lib/money"
import type { FilterConfig, FilterValue, RangeFilterValue } from "../lib/types"

const ALL = "__all"
const triggerClass =
  "inline-flex h-(--control-h) min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted dark:bg-input/30"

interface ControlProps<T, K extends FilterConfig<T>["kind"]> {
  config: Extract<FilterConfig<T>, { kind: K }>
  value: FilterValue | undefined
  onChange: (value: FilterValue | undefined) => void
  /** Linhas por opção (só no modo em memória). */
  counts?: Record<string, number>
}

function SelectFilter<T>({ config, value, onChange }: ControlProps<T, "select">) {
  return (
    <SimpleSelect
      ariaLabel={`Filtrar por ${config.label.toLowerCase()}`}
      value={typeof value === "string" && value ? value : ALL}
      onChange={(next) => onChange(next === ALL ? undefined : next)}
      options={[{ value: ALL, label: config.allLabel ?? `${config.label}: todos` }, ...config.options]}
      className="w-44"
    />
  )
}

function MultiSelectFilter<T>({ config, value, onChange, counts }: ControlProps<T, "multiselect">) {
  const selected = Array.isArray(value) ? value : []
  const toggle = (option: string) =>
    onChange(selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option])
  return (
    <Popover>
      <PopoverTrigger className={triggerClass} aria-label={`Filtrar por ${config.label.toLowerCase()}`}>
        <ListFilter className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {config.label}
        {selected.length > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{selected.length}</span>}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-1 p-1.5">
        <ul className="flex max-h-64 flex-col overflow-y-auto" aria-label={config.label}>
          {config.options.map((option) => (
            <li key={option.value}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox checked={selected.includes(option.value)} onCheckedChange={() => toggle(option.value)} />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {counts && <span className="text-xs text-muted-foreground tabular-nums">{counts[option.value] ?? 0}</span>}
              </label>
            </li>
          ))}
        </ul>
        {selected.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="self-end" onClick={() => onChange(undefined)}>
            Limpar
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Situação em "pílulas" sempre visíveis: cada uma liga/desliga e mostra quantas linhas traria. */
function StatusFilter<T>({ config, value, onChange, counts }: ControlProps<T, "status">) {
  const selected = Array.isArray(value) ? value : []
  const toggle = (option: string) =>
    onChange(selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option])
  return (
    <div role="group" aria-label={config.label} className="flex flex-wrap items-center gap-1.5">
      {config.options.map((option) => {
        const on = selected.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(option.value)}
            className={cn(
              "inline-flex h-(--control-h-sm) items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              on ? "border-primary/40 bg-primary/10 font-medium text-primary" : "border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {on && <Check className="size-3" aria-hidden />}
            {option.label}
            {counts && <span className="text-xs tabular-nums opacity-70">{counts[option.value] ?? 0}</span>}
          </button>
        )
      })}
    </div>
  )
}

function RangeFilter<T>({ config, value, onChange }: ControlProps<T, "range" | "money">) {
  const money = config.kind === "money"
  const current = (value && !Array.isArray(value) && typeof value === "object" ? value : {}) as RangeFilterValue
  const [open, setOpen] = useState(false)
  const [min, setMin] = useState("")
  const [max, setMax] = useState("")
  const [invalid, setInvalid] = useState(false)
  const id = useId()
  const text = (n: number | undefined) => (n === undefined ? "" : money ? formatMoneyInput(n) : String(n))
  const hasValue = current.min !== undefined || current.max !== undefined

  // O rascunho recomeça do valor aplicado cada vez que o popover abre.
  useEffect(() => {
    if (!open) return
    setMin(text(current.min))
    setMax(text(current.max))
    setInvalid(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [open])

  const read = (raw: string): number | null | undefined => {
    if (money) return parseMoneyToCents(raw)
    if (!raw.trim()) return undefined
    const n = Number(raw.replace(",", "."))
    return Number.isFinite(n) ? n : null
  }

  function apply() {
    const [lo, hi] = [read(min), read(max)]
    if (lo === null || hi === null) return setInvalid(true)
    if (lo !== undefined && hi !== undefined && lo > hi) return setInvalid(true)
    onChange(lo === undefined && hi === undefined ? undefined : { ...(lo !== undefined ? { min: lo } : {}), ...(hi !== undefined ? { max: hi } : {}) })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClass} aria-label={`Filtrar por ${config.label.toLowerCase()}`}>
        <ListFilter className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {config.label}
        {hasValue && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3 p-3">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            apply()
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-min`} className="text-xs text-muted-foreground">
                Mínimo{money ? " (R$)" : config.kind === "range" && config.unit ? ` (${config.unit})` : ""}
              </label>
              <Input id={`${id}-min`} inputMode={money ? "decimal" : "numeric"} value={min} onChange={(e) => setMin(e.target.value)} placeholder={money ? "0,00" : "0"} aria-invalid={invalid || undefined} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-max`} className="text-xs text-muted-foreground">
                Máximo{money ? " (R$)" : config.kind === "range" && config.unit ? ` (${config.unit})` : ""}
              </label>
              <Input id={`${id}-max`} inputMode={money ? "decimal" : "numeric"} value={max} onChange={(e) => setMax(e.target.value)} placeholder={money ? "0,00" : "0"} aria-invalid={invalid || undefined} />
            </div>
          </div>
          {invalid && (
            <p role="alert" className="text-xs text-destructive">
              {money ? "Use valores como 1.234,56, com o mínimo menor ou igual ao máximo." : "Informe números, com o mínimo menor ou igual ao máximo."}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(undefined); setOpen(false) }} disabled={!hasValue && !min && !max}>
              Limpar
            </Button>
            <Button type="submit" size="sm">
              Aplicar
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

export function FilterControl<T>({
  config,
  value,
  onChange,
  counts,
}: {
  config: FilterConfig<T>
  value: FilterValue | undefined
  onChange: (value: FilterValue | undefined) => void
  counts?: Record<string, number>
}) {
  switch (config.kind) {
    case "select":
      return <SelectFilter config={config} value={value} onChange={onChange} />
    case "multiselect":
      return <MultiSelectFilter config={config} value={value} onChange={onChange} counts={counts} />
    case "status":
      return <StatusFilter config={config} value={value} onChange={onChange} counts={counts} />
    case "range":
    case "money":
      return <RangeFilter config={config} value={value} onChange={onChange} />
    case "date-range":
      return (
        <DateRangePicker
          label={config.label}
          value={value && !Array.isArray(value) && typeof value === "object" ? (value as { from?: string; to?: string }) : undefined}
          onChange={(range) => onChange(range.from || range.to ? range : undefined)}
        />
      )
  }
}
