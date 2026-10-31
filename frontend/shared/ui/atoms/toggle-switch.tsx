"use client"

import { HaloSwitch } from "@/components/ui/halo-switch"

/** Átomo de alternância — Cult UI Halo Switch com assinatura booleana simples. */
export function Switch({
  checked,
  onCheckedChange,
  ...props
}: {
  id?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  "aria-label"?: string
  size?: "sm" | "default"
}) {
  return <HaloSwitch checked={checked} onCheckedChange={(v) => onCheckedChange(Boolean(v))} {...props} />
}
