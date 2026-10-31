"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export function SimpleSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Selecione",
  className,
  disabled,
  invalid,
  ariaLabel,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  invalid?: boolean
  ariaLabel?: string
}) {
  return (
    <Select
      items={options}
      value={value || null}
      onValueChange={(v) => onChange((v as string | null) ?? "")}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} aria-invalid={invalid || undefined} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
