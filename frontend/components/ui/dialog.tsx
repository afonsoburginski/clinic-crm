"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Estrutura compartilhada (Dialog, AlertDialog e Sheet):
 *  - popup em `glass-modal` (vidro sutil, fallback opaco em globals.css);
 *  - cabeçalho/rodapé fixos (`glass-sticky`) e corpo rolável, com padding em `--dialog-pad`;
 *  - abaixo de `sm` o dialog encosta na base como bottom sheet;
 *  - transição por `data-starting-style`/`data-ending-style` (respeita reduced motion via globals.css).
 */
const dialogContentVariants = cva(
  [
    "glass-modal fixed z-50 flex flex-col overflow-hidden text-sm text-popover-foreground outline-none",
    "inset-x-0 bottom-0 max-h-[calc(100dvh-1rem)] w-full rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
    "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-4rem)] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-0",
    "transition-[opacity,scale,translate] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
    "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-150",
    "max-sm:data-starting-style:translate-y-8 max-sm:data-ending-style:translate-y-8",
    "sm:data-starting-style:scale-[0.97] sm:data-ending-style:scale-[0.97]",
    "data-nested-dialog-open:sm:scale-[0.985]",
  ],
  {
    variants: {
      size: {
        sm: "sm:max-w-sm",
        md: "sm:max-w-md",
        lg: "sm:max-w-lg",
        xl: "sm:max-w-xl",
        "2xl": "sm:max-w-2xl",
      },
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
        "glass-scrim fixed inset-0 isolate z-50 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
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
        <div
          data-slot="dialog-scroll"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-(--dialog-pad) pb-(--dialog-pad)"
        >
          {children}
        </div>
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
        "glass-sticky sticky top-0 z-10 -mx-(--dialog-pad) flex flex-col gap-1 border-b px-(--dialog-pad) py-4 pr-14",
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
        "glass-sticky sticky bottom-0 z-10 -mx-(--dialog-pad) -mb-(--dialog-pad) mt-auto flex flex-col-reverse gap-2 border-t px-(--dialog-pad) py-3 sm:flex-row sm:items-center sm:justify-end",
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
