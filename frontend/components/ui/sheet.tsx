"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SHEET_MAX_HEIGHT, SHEET_WIDTHS, type SheetSize } from "@/components/ui/dialog-sizes"
import { LAYERS } from "@/components/ui/layers"
import { cn } from "@/lib/utils"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        `glass-scrim fixed inset-0 ${LAYERS.dialog} transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0`,
        className
      )}
      {...props}
    />
  )
}

/**
 * Painel lateral (ou de borda) com a mesma estrutura dos dialogs: header e footer fixos (`shrink-0`),
 * corpo rolável (`SheetBody`) e padding em `--dialog-pad`. Largura por `size` (`dialog-sizes.ts`, sempre
 * `min(92vw, X)`), altura de painéis de borda limitada a 90 dvh. Fecha com Esc, clique fora e botão.
 */
function SheetContent({
  className,
  children,
  side = "right",
  size = "md",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  size?: SheetSize
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          `glass-modal fixed ${LAYERS.dialog} flex flex-col text-sm text-popover-foreground outline-none`,
          SHEET_MAX_HEIGHT,
          SHEET_WIDTHS[size],
          "transition-[opacity,translate] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-ending-style:duration-150 data-starting-style:opacity-0",
          "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:rounded-t-2xl data-[side=bottom]:data-ending-style:translate-y-8 data-[side=bottom]:data-starting-style:translate-y-8",
          "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:rounded-b-2xl data-[side=top]:data-ending-style:-translate-y-8 data-[side=top]:data-starting-style:-translate-y-8",
          "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-dvh data-[side=left]:rounded-r-2xl data-[side=left]:data-ending-style:-translate-x-8 data-[side=left]:data-starting-style:-translate-x-8",
          "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-dvh data-[side=right]:rounded-l-2xl data-[side=right]:data-ending-style:translate-x-8 data-[side=right]:data-starting-style:translate-x-8",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
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
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b px-(--dialog-pad) py-4 pr-14",
        className
      )}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-(--dialog-pad) py-4",
        className
      )}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex shrink-0 items-center gap-2 border-t px-(--dialog-pad) py-3",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "text-base leading-snug font-semibold tracking-tight text-balance text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
