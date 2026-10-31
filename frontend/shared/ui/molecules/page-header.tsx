import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * Cabeçalho único de tela (lista, detalhe e formulário).
 * `back` troca o link solto de “Voltar” de cada detalhe por um padrão só.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
  leading,
  badge,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  back?: { href: string; label: string }
  /** Avatar ou ícone antes do título (detalhes de pessoa). */
  leading?: React.ReactNode
  /** Pill de situação ao lado do título, fora do `<h1>`. */
  badge?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {back && (
        <Link
          href={back.href}
          className="inline-flex h-(--control-h-xs) w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {leading}
          <div className="flex min-w-0 flex-col gap-1.5">
            {eyebrow && <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</div>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance md:text-[28px]">{title}</h1>
              {badge}
            </div>
            {description && <p className="max-w-2xl text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
