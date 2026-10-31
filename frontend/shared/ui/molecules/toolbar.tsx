import { cn } from "@/lib/utils"

/**
 * Barra de ferramentas única das telas (busca, filtros, período, visões).
 * Todos os controles têm a altura padrão (`--control-h`) e o espaçamento é fixo,
 * então listas, agenda, financeiro, auditoria e detalhes ficam alinhados.
 *
 *  - `card`: faixa no topo de um `SectionCard` (borda inferior, alinhada ao `px-5` das tabelas);
 *  - `bar`: barra solta sobre a página, em vidro leve, fixa abaixo da topbar em telas largas.
 */
export function Toolbar({
  variant = "card",
  label,
  className,
  children,
}: {
  variant?: "card" | "bar"
  /** Nome acessível do grupo de controles. */
  label?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="toolbar"
      data-variant={variant}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        variant === "card" && "border-b px-5 py-3",
        variant === "bar" &&
          "glass-bar rounded-xl border px-3 py-2 shadow-xs lg:sticky lg:top-[calc(var(--topbar-h)+0.5rem)] lg:z-20",
        className
      )}
    >
      {children}
    </div>
  )
}

/** Agrupa controles que quebram de linha juntos; `end` alinha o grupo à direita em telas largas. */
export function ToolbarGroup({
  align = "start",
  className,
  children,
}: {
  align?: "start" | "end"
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      data-slot="toolbar-group"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2",
        align === "end" && "sm:ml-auto sm:justify-end",
        className
      )}
    >
      {children}
    </div>
  )
}

/** Rodapé de lista (contagem, paginação) alinhado à mesma grade da toolbar e das tabelas. */
export function ListFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p data-slot="list-footer" className={cn("border-t px-5 py-3 text-xs text-muted-foreground", className)}>
      {children}
    </p>
  )
}
