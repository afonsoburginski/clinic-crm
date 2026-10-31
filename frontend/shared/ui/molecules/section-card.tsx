"use client"

import { HaloCard, HaloCardAction, HaloCardContent, HaloCardDescription, HaloCardHeader, HaloCardTitle } from "@/components/ui/halo-card"
import { cn } from "@/lib/utils"

/** Seção em cartão — Cult UI Halo Card (borda animada só no hover/foco). */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  const label = typeof title === "string" ? title : "Seção"
  return (
    <HaloCard padding="none" translucent={false} aria-label={label} className={cn("flex flex-col", className)}>
      {(title || actions) && (
        <HaloCardHeader className="border-b px-5 py-4">
          {title && <HaloCardTitle className="text-sm font-semibold">{title}</HaloCardTitle>}
          {description && <HaloCardDescription className="leading-relaxed">{description}</HaloCardDescription>}
          {actions && <HaloCardAction className="flex items-center gap-2">{actions}</HaloCardAction>}
        </HaloCardHeader>
      )}
      <HaloCardContent className={cn("p-5", bodyClassName)}>{children}</HaloCardContent>
    </HaloCard>
  )
}
