"use client"

import * as React from "react"
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"

import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { LAYERS } from "@/components/ui/layers"
import { cn } from "@/lib/utils"

/**
 * Menu de contexto (botão direito, pressão longa no toque, tecla Menu / Shift+F10 no teclado — o navegador
 * dispara `contextmenu` para as três). O popup e os itens são os MESMOS do `dropdown-menu.tsx` (base-ui Menu):
 * o menu "⋯" e o clique direito ficam visual e semanticamente idênticos. Só a raiz, o gatilho e o posicionador mudam.
 */
function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

/** Área que abre o menu. Renderiza um `<div>`; use `render={<tr />}` etc. para manter a semântica do elemento. */
function ContextMenuTrigger({ className, ...props }: ContextMenuPrimitive.Trigger.Props) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" className={className} {...props} />
}

function ContextMenuContent({ className, ...props }: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className={`isolate ${LAYERS.popover} outline-none`}>
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(
            `${LAYERS.popover} max-h-(--available-height) w-auto min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95`,
            className
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  DropdownMenuGroup as ContextMenuGroup,
  DropdownMenuLabel as ContextMenuLabel,
  DropdownMenuItem as ContextMenuItem,
  DropdownMenuCheckboxItem as ContextMenuCheckboxItem,
  DropdownMenuRadioGroup as ContextMenuRadioGroup,
  DropdownMenuRadioItem as ContextMenuRadioItem,
  DropdownMenuSeparator as ContextMenuSeparator,
  DropdownMenuShortcut as ContextMenuShortcut,
  DropdownMenuSub as ContextMenuSub,
  DropdownMenuSubTrigger as ContextMenuSubTrigger,
  DropdownMenuSubContent as ContextMenuSubContent,
}
