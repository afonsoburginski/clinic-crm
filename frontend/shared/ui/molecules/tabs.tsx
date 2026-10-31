"use client"

import type { ComponentProps } from "react"

import {
  HaloTabs,
  HaloTabsContent,
  HaloTabsIndicator,
  HaloTabsList,
  HaloTabsTrigger,
} from "@/components/ui/halo-tabs"

/** Abas do sistema — Cult UI Halo Tabs com indicador animado já incluso na lista. */
export const Tabs = HaloTabs
export const TabsTrigger = HaloTabsTrigger
export const TabsContent = HaloTabsContent

export function TabsList({ children, ...props }: ComponentProps<typeof HaloTabsList>) {
  return (
    <HaloTabsList variant="pill" {...props}>
      {children}
      <HaloTabsIndicator variant="pill" />
    </HaloTabsList>
  )
}
