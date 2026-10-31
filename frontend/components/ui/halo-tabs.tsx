"use client"

/**
 * Tabs aligned with `HaloCard` rim language, driven by the shared `--halo-*` theme ramp.
 */
import type { ComponentProps } from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

/** Ambient gradient (pill indicator glow) — same hue family as `HaloCardBorderTrail`. */
const TAB_GRADIENT_GLOW =
  "linear-gradient(90deg, transparent 0%, color-mix(in oklch, var(--halo-1) 35%, transparent) 22%, color-mix(in oklch, var(--halo-2) 45%, transparent) 50%, color-mix(in oklch, var(--halo-3) 38%, transparent) 78%, transparent 100%)"

export type HaloTabsVariant = "underline" | "pill"

export function HaloTabs({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      {...props}
      className={cn(
        // `flex-1 min-w-0` so the root fills centered flex previews (e.g. docs ComponentPreview) instead of
        // shrink-wrapping to the active panel. Grid column `minmax(0,1fr)` keeps tab + panel width stable.
        "group/halo-tabs grid w-full min-w-0 max-w-full flex-1 grid-cols-[minmax(0,1fr)] gap-3",
        "data-[orientation=vertical]:flex data-[orientation=vertical]:flex-row data-[orientation=vertical]:gap-4",
        className
      )}
      data-slot="halo-tabs"
    />
  )
}

export function HaloTabsList({
  className,
  variant = "underline",
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & {
  variant?: HaloTabsVariant
}) {
  return (
    <TabsPrimitive.List
      {...props}
      className={cn(
        "group/halo-tabs-list relative flex w-fit min-w-0 flex-wrap items-center gap-1",
        variant === "underline" &&
          "w-full gap-6 border-border/50 border-b pb-px data-[orientation=vertical]:flex-col data-[orientation=vertical]:gap-2 data-[orientation=vertical]:border-b-0 data-[orientation=vertical]:border-l data-[orientation=vertical]:pb-0 data-[orientation=vertical]:pl-px",
        variant === "pill" &&
          "gap-0 rounded-full border border-border/80 bg-muted/60 p-1 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset] dark:border-border dark:bg-muted/60",
        className
      )}
      data-slot="halo-tabs-list"
      data-variant={variant}
    />
  )
}

export function HaloTabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      {...props}
      className={cn(
        "relative z-1 inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md px-3 py-2",
        "font-medium text-muted-foreground text-sm tracking-tight antialiased",
        "outline-none transition-colors duration-200 ease-out",
        "focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-active:text-foreground",
        "group-data-[variant=pill]/halo-tabs-list:min-h-[1.875rem] group-data-[variant=pill]/halo-tabs-list:rounded-full group-data-[variant=pill]/halo-tabs-list:px-4 group-data-[variant=pill]/halo-tabs-list:py-1",
        "group-data-[variant=underline]/halo-tabs-list:data-active:bg-transparent",
        className
      )}
      data-slot="halo-tabs-trigger"
    />
  )
}

export function HaloTabsIndicator({
  className,
  variant = "underline",
  ...props
}: ComponentProps<typeof TabsPrimitive.Indicator> & {
  variant?: HaloTabsVariant
}) {
  return (
    <TabsPrimitive.Indicator
      {...props}
      className={cn(
        "pointer-events-none absolute z-0",
        variant === "underline" &&
          "-bottom-px left-(--active-tab-left) h-0.5 w-(--active-tab-width) rounded-none shadow-[0_0_12px_color-mix(in_oklch,var(--halo-2)_35%,transparent),0_0_24px_color-mix(in_oklch,var(--halo-3)_20%,transparent)] transition-[left,width] duration-300 ease-out [background:linear-gradient(90deg,transparent_0%,color-mix(in_oklch,var(--halo-1)_85%,transparent)_18%,color-mix(in_oklch,var(--halo-2)_92%,transparent)_50%,color-mix(in_oklch,var(--halo-3)_88%,transparent)_82%,transparent_100%)] motion-reduce:transition-none",
        variant === "pill" &&
          "top-(--active-tab-top) left-(--active-tab-left) h-(--active-tab-height) w-(--active-tab-width) rounded-full transition-[left,width,top,height] duration-300 ease-out motion-reduce:transition-none",
        className
      )}
      data-slot="halo-tabs-indicator"
    >
      {variant === "pill" ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 overflow-hidden rounded-full",
            // Hairline “ring” + softer lift: layered shadows (no heavy 10px blur) for edge definition on any background.
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.11),0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.045)]",
            "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.22)]"
          )}
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in oklch, var(--card) 88%, transparent), color-mix(in oklch, var(--card) 72%, transparent))",
          }}
        />
      ) : null}
      {variant === "pill" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full opacity-90"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in oklch, var(--halo-1) 20%, transparent), color-mix(in oklch, var(--halo-2) 28%, transparent), color-mix(in oklch, var(--halo-3) 22%, transparent))",
            mixBlendMode: "multiply",
          }}
        />
      ) : null}
      {variant === "pill" ? (
        <span
          aria-hidden
          className="-bottom-px pointer-events-none absolute inset-x-0 h-1/2 rounded-b-full opacity-55 blur-sm dark:opacity-75"
          style={{ background: TAB_GRADIENT_GLOW }}
        />
      ) : null}
    </TabsPrimitive.Indicator>
  )
}

export function HaloTabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Panel>) {
  return (
    <TabsPrimitive.Panel
      {...props}
      className={cn(
        "w-full min-w-0 text-pretty text-foreground text-sm/relaxed outline-none",
        className
      )}
      data-slot="halo-tabs-content"
    />
  )
}

export type HaloTabsProps = ComponentProps<typeof TabsPrimitive.Root>
