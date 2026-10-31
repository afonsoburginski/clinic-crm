import { AlertTriangle, Inbox, Lock, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ForbiddenError } from "@/domain/errors"
import { cn } from "@/lib/utils"
import { errorMessage } from "@/shared/lib/notify"

function StateFrame({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return <StateFrame icon={icon ?? <Inbox className="size-5" aria-hidden />} title={title} description={description} action={action} className={className} />
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  if (error instanceof ForbiddenError) {
    return (
      <StateFrame
        icon={<Lock className="size-5" aria-hidden />}
        title="Acesso restrito"
        description={error.message}
        className={className}
      />
    )
  }
  return (
    <StateFrame
      icon={<AlertTriangle className="size-5" aria-hidden />}
      title="Não foi possível carregar"
      description={errorMessage(error)}
      className={className}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RotateCw data-icon="inline-start" aria-hidden />
            Tentar novamente
          </Button>
        )
      }
    />
  )
}

export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 p-4", className)} aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}
