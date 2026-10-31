"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DIALOG_MAX_HEIGHT,
  DIALOG_MAX_HEIGHT_MOBILE,
  DIALOG_MIN_WIDTH,
  DIALOG_SIZE_CLASSES,
} from "@/components/ui/dialog-sizes"
import { LAYERS } from "@/components/ui/layers"
import { cn } from "@/lib/utils"

/**
 * Anatomia (Dialog, AlertDialog e Sheet), detalhada em `specs/ui/dialogs.md`:
 *  - popup em `glass-modal` (vidro sutil, fallback opaco em globals.css), coluna flex com altura máxima de 90 dvh;
 *  - `DialogHeader` e `DialogFooter` fixos (`shrink-0`) e `DialogBody` rolável (`min-h-0 flex-1 overflow-y-auto`),
 *    com padding em `--dialog-pad`; a barra de rolagem fica só no corpo;
 *  - largura por variante em `dialog-sizes.ts` (`min(92vw, X)`); abaixo de `sm` o dialog encosta na base (bottom sheet);
 *  - sem `DialogBody` (diálogos curtos, estados de carregamento) o popup inteiro rola;
 *  - transição por `data-starting-style`/`data-ending-style` (respeita reduced motion via globals.css).
 */
const dialogContentVariants = cva(
  [
    `glass-modal fixed ${LAYERS.dialog} flex flex-col overflow-y-auto overscroll-contain text-sm text-popover-foreground outline-none has-data-[slot=dialog-body]:overflow-hidden`,
    `inset-x-0 bottom-0 ${DIALOG_MAX_HEIGHT_MOBILE} w-full rounded-t-2xl pb-[env(safe-area-inset-bottom)]`,
    `sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 ${DIALOG_MAX_HEIGHT} ${DIALOG_MIN_WIDTH} sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-0`,
    "transition-[opacity,scale,translate] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
    "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-150",
    "max-sm:data-starting-style:translate-y-8 max-sm:data-ending-style:translate-y-8",
    "sm:data-starting-style:scale-[0.97] sm:data-ending-style:scale-[0.97]",
    "data-nested-dialog-open:sm:scale-[0.985]",
  ],
  {
    variants: {
      size: DIALOG_SIZE_CLASSES,
    },
    defaultVariants: { size: "md" },
  }
)

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        `glass-scrim fixed inset-0 isolate ${LAYERS.dialog} transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0`,
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  size,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props &
  VariantProps<typeof dialogContentVariants> & {
    showCloseButton?: boolean
  }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(dialogContentVariants({ size }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3 z-20"
                size="icon-sm"
              />
            }
          >
            <XIcon aria-hidden />
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "glass-sticky flex shrink-0 flex-col gap-1 border-b px-(--dialog-pad) py-4 pr-14",
        className
      )}
      {...props}
    />
  )
}

/** Corpo rolável: único trecho do dialog que rola, entre o header e o footer fixos. */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-(--dialog-pad) py-4",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "glass-sticky mt-auto flex shrink-0 flex-col-reverse gap-2 border-t px-(--dialog-pad) py-3 sm:flex-row sm:items-center sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Fechar
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-base leading-snug font-semibold tracking-tight text-balance text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm leading-relaxed text-pretty text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  dialogContentVariants,
}
