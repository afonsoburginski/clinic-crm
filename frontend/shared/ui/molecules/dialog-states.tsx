import { DialogBody, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

import { ErrorState } from "./feedback-states"

/** Carregamento de dialog de detalhe: mantém o título (nome acessível) e a faixa de cabeçalho. */
export function DialogLoadingState({ title }: { title: string }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogBody aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </DialogBody>
    </>
  )
}

export function DialogErrorState({ title, error }: { title: string; error: unknown }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <ErrorState error={error} />
      </DialogBody>
    </>
  )
}
