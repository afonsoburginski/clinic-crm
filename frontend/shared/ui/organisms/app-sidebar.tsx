"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { canAny } from "@/domain/permissions"
import type { User } from "@/domain/types"
import { cn } from "@/lib/utils"

import { BrandMark } from "../atoms/brand-mark"
import { NAV_SECTIONS } from "./nav-config"
import { AccountMenu } from "./account-menu"

export function AppSidebarNav({ user, onNavigate }: { user: User | null; onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((item) => canAny(user, item.anyOf))
        if (!items.length) return null
        return (
          <div key={section.label} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{section.label}</p>
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

export function AppSidebar({ user }: { user: User | null }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto overscroll-contain border-r bg-sidebar px-3 py-5 lg:flex">
      <Link href="/painel" className="px-2" aria-label="Villiére — visão geral">
        <BrandMark />
      </Link>
      <AppSidebarNav user={user} />
      <div className="mt-auto border-t border-sidebar-border pt-3"><AccountMenu user={user} /></div>
    </aside>
  )
}
