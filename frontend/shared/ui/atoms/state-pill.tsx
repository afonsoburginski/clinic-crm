import { cn } from "@/lib/utils"

type Tone = "positive" | "neutral" | "muted" | "warning" | "info" | "danger"

/** Fundo suave + texto de alto contraste (≥4.5:1) vindos dos tokens semânticos. */
const TONES: Record<Tone, string> = {
  positive: "bg-success-soft text-success-foreground",
  neutral: "bg-muted text-foreground",
  muted: "bg-muted text-muted-foreground",
  warning: "bg-warning-soft text-warning-foreground",
  info: "bg-info-soft text-info-foreground",
  danger: "bg-danger-soft text-danger-foreground",
}

export function StatePill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-transparent px-2.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function ActivePill({ active }: { active: boolean }) {
  return <StatePill tone={active ? "positive" : "muted"}>{active ? "Ativo" : "Inativo"}</StatePill>
}
