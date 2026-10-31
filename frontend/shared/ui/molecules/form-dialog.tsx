"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { DialogSize } from "@/components/ui/dialog-sizes"

import { ConfirmDialog } from "./confirm-dialog"
import { ErrorState, ListSkeleton } from "./feedback-states"

export const DISCARD_TITLE = "Descartar alterações?"
export const DISCARD_DESCRIPTION = "O que você preencheu neste formulário ainda não foi salvo e será perdido."

/**
 * Fechar com alterações pendentes pede confirmação (Esc, clique fora, X e Cancelar passam pelo mesmo caminho).
 * Salvar com sucesso chama `onClose` direto, sem confirmação. Durante o envio o dialog não fecha: o resultado
 * (sucesso ou erro) sempre chega a quem está olhando para ele.
 */
export function useCloseGuard({ isDirty, pending, onClose }: { isDirty?: boolean; pending?: boolean; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false)

  const requestClose = () => {
    if (pending) return
    if (isDirty) setConfirming(true)
    else onClose()
  }

  /** Renderize dentro do `DialogContent`: o aviso fica aninhado ao formulário (foco e Esc vão para ele primeiro). */
  const discardDialog = (
    <ConfirmDialog
      open={confirming}
      onOpenChange={setConfirming}
      destructive
      title={DISCARD_TITLE}
      description={DISCARD_DESCRIPTION}
      confirmLabel="Descartar"
      onConfirm={() => {
        setConfirming(false)
        onClose()
      }}
    />
  )

  return { requestClose, discardDialog }
}

export interface FormDialogProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Tamanho do dialog (`specs/ui/dialogs.md`): `sm` poucos campos, `md` padrão, `lg`/`xl` formulários grandes. */
  size?: DialogSize
  /** `id` do `<form>` que vai em `children`; o botão do rodapé (fixo, fora da rolagem) o envia por `form=`. */
  formId: string
  submitLabel: string
  pendingLabel?: string
  pending?: boolean
  /** Formulário com alterações não salvas: fechar pede confirmação de descarte. */
  isDirty?: boolean
  submitDisabled?: boolean
  /** Fecha o dialog (sem salvar ou depois de salvar). */
  onClose: () => void
  children: React.ReactNode
}

/**
 * Dialog de criar/editar: cabeçalho e rodapé fixos, corpo rolável e descarte confirmado. Todo formulário de
 * criação/edição do app usa este componente, sobre a tela de lista ou de detalhe, sem trocar de página.
 */
export function FormDialog({
  title,
  description,
  size = "md",
  formId,
  submitLabel,
  pendingLabel = "Salvando…",
  pending,
  isDirty,
  submitDisabled,
  onClose,
  children,
}: FormDialogProps) {
  const { requestClose, discardDialog } = useCloseGuard({ isDirty, pending, onClose })

  return (
    <Dialog open onOpenChange={(open) => !open && requestClose()}>
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <DialogBody>{children}</DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={requestClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={pending || submitDisabled}>
            {pending ? pendingLabel : submitLabel}
          </Button>
        </DialogFooter>

        {discardDialog}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Dialog de criar/editar sem formulário ainda: carregando ou erro (ex.: edição por deep-link). Mesmo tamanho e
 * anatomia do `FormDialog` para o dialog não "pular" quando o formulário chega.
 */
export function FormDialogState({
  title,
  size = "md",
  onClose,
  children,
}: {
  title: React.ReactNode
  size?: DialogSize
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Edição de um registro que a tela não tem em mãos (ex.: `?editar=<id>` numa lista paginada no servidor): busca o
 * registro e mostra carregando/erro no mesmo dialog, trocando pelo formulário quando chega.
 */
export function FormDialogLoader<T>({
  title,
  size = "md",
  state,
  onClose,
  children,
}: {
  title: React.ReactNode
  size?: DialogSize
  state: { data: T | undefined; error: unknown; refetch?: () => unknown }
  onClose: () => void
  children: (data: T) => React.ReactNode
}) {
  if (state.data !== undefined) return <>{children(state.data)}</>
  return (
    <FormDialogState title={title} size={size} onClose={onClose}>
      {state.error ? <ErrorState error={state.error} onRetry={state.refetch ? () => void state.refetch?.() : undefined} /> : <ListSkeleton rows={4} />}
    </FormDialogState>
  )
}
