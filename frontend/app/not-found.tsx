import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { RouteTransition } from "@/shared/ui/templates/route-transition"

export default function NotFound() {
  return (
    <RouteTransition>
      <main className="page-container flex min-h-dvh flex-col items-center justify-center gap-4 py-(--page-pad-y) text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="font-serif text-2xl text-balance">Página não encontrada</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">O endereço pode ter mudado ou o registro foi removido.</p>
        <Link href="/painel" className={buttonVariants()}>
          Ir para a visão geral
        </Link>
      </main>
    </RouteTransition>
  )
}
