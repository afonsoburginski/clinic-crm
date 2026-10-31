"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { OnboardingTour } from "@/modules/onboarding/components/onboarding-tour"
import { useCurrentUser } from "@/shared/lib/current-user"

import { AppSidebar } from "../organisms/app-sidebar"
import { AppTopbar } from "../organisms/app-topbar"
import { RouteTransition } from "./route-transition"

/**
 * Casca do painel. O contêiner `page-container` e o `--page-gap` são a única fonte de
 * espaçamento das telas: views devolvem fragmentos e herdam gutter, padding e ritmo vertical.
 */
export function PanelShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isSignedIn } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isSignedIn) router.replace("/entrar")
  }, [isLoading, isSignedIn, router])

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-popover px-3 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <AppSidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar user={user} />
        <main id="conteudo" tabIndex={-1} className="page-container flex flex-1 flex-col py-(--page-pad-y) outline-none">
          <RouteTransition className="flex flex-1 flex-col gap-(--page-gap)">
            {user ? (
              children
            ) : (
              <div className="flex flex-col gap-4" aria-busy="true">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96 max-w-full" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            )}
          </RouteTransition>
        </main>
      </div>
      {user && <OnboardingTour user={user} />}
    </div>
  )
}
