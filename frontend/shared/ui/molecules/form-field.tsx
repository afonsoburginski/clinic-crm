"use client"

import { HaloField, HaloFieldDescription, HaloFieldError, HaloFieldLabel } from "@/components/ui/halo-field"
import { cn } from "@/lib/utils"

import { Switch } from "../atoms/toggle-switch"

/** Campo de formulário: rótulo, controle, dica e erro (Cult UI Halo Field). */
export function FormField({
  id,
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  id: string
  label: React.ReactNode
  error?: string
  hint?: React.ReactNode
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <HaloField data-invalid={error ? true : undefined} className={cn("gap-1.5", className)}>
      <HaloFieldLabel htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </HaloFieldLabel>
      {children}
      {error ? (
        <HaloFieldError id={`${id}-error`} role="alert">
          {error}
        </HaloFieldError>
      ) : (
        hint && <HaloFieldDescription className="text-xs leading-relaxed">{hint}</HaloFieldDescription>
      )}
    </HaloField>
  )
}

export function SwitchField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border bg-card/60 px-3.5 py-3">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm leading-snug font-medium">
          {label}
        </label>
        {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}
