"use client"

import { HaloCard } from "@/components/ui/halo-card"
import { cn } from "@/lib/utils"

import { CountUp } from "../atoms/count-up"

export function StatTile({
  label,
  value,
  suffix,
  display,
  hint,
  className,
}: {
  label: string
  value: number
  suffix?: string
  /** Valor já formatado (ex.: moeda com centavos): substitui o número animado. */
  display?: string
  hint?: React.ReactNode
  className?: string
}) {
  return (
    <HaloCard padding="sm" translucent={false} aria-label={label} className={className}>
      <div className={cn("flex flex-col gap-2 p-1")}>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="font-serif text-3xl leading-none font-semibold tracking-tight">
          {display ?? <CountUp to={value} suffix={suffix} />}
        </span>
        {hint && <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>}
      </div>
    </HaloCard>
  )
}
