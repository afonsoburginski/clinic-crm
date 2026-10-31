"use client"

import { Menu, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { User } from "@/domain/types"
import { useUiStore } from "@/shared/lib/ui-store"
import { BrandMark } from "../atoms/brand-mark"
import { AccountMenu } from "./account-menu"
import { AppSidebarNav } from "./app-sidebar"
import { PatientQuickSearch } from "./patient-quick-search"

export function AppTopbar({ user }: { user: User | null }) {
  const menuOpen = useUiStore((s) => s.mobileNavOpen)
  const setMenuOpen = useUiStore((s) => s.setMobileNavOpen)
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <header className="glass-bar sticky top-0 z-30 h-(--topbar-h) border-b">
      <div className="page-container flex h-full items-center gap-2">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" />}><Menu aria-hidden /></SheetTrigger>
          <SheetContent side="left" className="bg-sidebar data-[side=left]:w-72">
            <SheetHeader><SheetTitle><BrandMark /></SheetTitle></SheetHeader>
            <SheetBody className="flex flex-col gap-5 px-3">
              <AppSidebarNav user={user} onNavigate={() => setMenuOpen(false)} />
              <div className="mt-auto border-t pt-3"><AccountMenu user={user} /></div>
            </SheetBody>
          </SheetContent>
        </Sheet>
        <PatientQuickSearch />
        <Button variant="ghost" size="icon" className="ml-auto" aria-label="Alternar tema" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <Sun className="hidden dark:block" aria-hidden /><Moon className="dark:hidden" aria-hidden />
        </Button>
      </div>
    </header>
  )
}
