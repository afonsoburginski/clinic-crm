import { ShieldOff } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export function AccessDenied({ description }: { description?: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ShieldOff className="size-5" aria-hidden />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h1 className="font-serif text-2xl text-foreground text-balance">Acesso restrito</h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          {description ?? "Seu perfil não tem permissão para esta área. Fale com a administração se precisar de acesso."}
        </p>
      </div>
      <Link href="/painel" className={buttonVariants({ variant: "outline" })}>
        Voltar à visão geral
      </Link>
    </div>
  )
}
