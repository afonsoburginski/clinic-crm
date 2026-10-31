"use client"

import { MoreHorizontal } from "lucide-react"
import { createContext, useCallback, useContext, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { can } from "@/domain/permissions"
import { cn } from "@/lib/utils"
import { notifyError, notifySuccess } from "@/shared/lib/notify"
import { useSessionStore } from "@/shared/lib/session-store"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"

import { buildMenu, confirmOf, copiedMessage, countItems, intentOf, type EntityAction, type ItemNode, type MenuNode } from "./lib/build-menu"
import { copyText } from "./lib/clipboard"

interface EntityMenuController {
  nodes: MenuNode[]
  select: (node: ItemNode) => void
}

const EntityMenuContext = createContext<EntityMenuController | null>(null)

function useController() {
  const controller = useContext(EntityMenuContext)
  if (!controller) throw new Error("EntityContextMenu e EntityActionsButton precisam estar dentro de <EntityMenu>.")
  return controller
}

/**
 * Resolve as ações da entidade para o usuário da sessão e cuida de copiar, confirmar e executar.
 * O snapshot da sessão evita uma consulta por linha da tabela: a API revalida toda ação de qualquer forma.
 */
export function useEntityMenu(actions: readonly EntityAction[]) {
  const user = useSessionStore((state) => state.user)
  const nodes = buildMenu(actions, (permission) => can(user, permission))
  const [confirming, setConfirming] = useState<ItemNode | null>(null)
  const [pending, setPending] = useState(false)
  const lastConfirm = useRef<ItemNode | null>(null)
  if (confirming) lastConfirm.current = confirming

  const run = useCallback(async (node: ItemNode, reason?: string) => {
    if (node.action.kind === "copy") return
    try {
      await node.action.onSelect(reason)
    } catch (error) {
      notifyError(error)
    }
  }, [])

  const select = useCallback(
    (node: ItemNode) => {
      const intent = intentOf(node)
      if (intent === "copy" && node.action.kind === "copy") {
        const action = node.action
        void copyText(action.text).then((ok) => (ok ? notifySuccess(copiedMessage(action)) : notifyError(new Error("clipboard"))))
        return
      }
      // O menu fecha e só então o diálogo abre: abrir no mesmo tick brigaria pelo foco com o menu que está saindo.
      if (intent === "confirm") setTimeout(() => setConfirming(node), 0)
      else void run(node)
    },
    [run]
  )

  const shown = confirming ?? lastConfirm.current
  const confirm = shown ? confirmOf(shown) : null
  const dialog = confirm ? (
    <ConfirmDialog
      open={!!confirming}
      onOpenChange={(open) => !open && !pending && setConfirming(null)}
      title={confirm.title}
      description={confirm.description}
      confirmLabel={confirm.confirmLabel}
      destructive={!!shown?.destructive}
      reason={confirm.reason}
      pending={pending}
      onConfirm={async (reason) => {
        if (!confirming) return
        setPending(true)
        await run(confirming, reason)
        setPending(false)
        setConfirming(null)
      }}
    />
  ) : null

  return { nodes, select, dialog }
}

/** Provedor das ações de UMA entidade: o clique direito e o botão "⋯" dentro dele usam a mesma lista e o mesmo ConfirmDialog. */
export function EntityMenu({ actions, children }: { actions: readonly EntityAction[]; children: React.ReactNode }) {
  const { nodes, select, dialog } = useEntityMenu(actions)
  return (
    <EntityMenuContext.Provider value={{ nodes, select }}>
      {children}
      {dialog}
    </EntityMenuContext.Provider>
  )
}

/** Item desabilitado explica o motivo na própria linha: o tooltip nativo não aparece em item sem ponteiro. */
function ItemLabel({ label, reason }: { label: string; reason?: string }) {
  if (!reason) return label
  return (
    <span className="flex max-w-64 flex-col">
      <span>{label}</span>
      <span className="text-xs leading-snug font-normal whitespace-normal text-muted-foreground">{reason}</span>
    </span>
  )
}

/** Desenha os nós já resolvidos. Os itens vêm do dropdown-menu e valem para os dois menus (⋯ e clique direito). */
export function EntityMenuItems({ nodes, onSelect }: { nodes: readonly MenuNode[]; onSelect: (node: ItemNode) => void }) {
  return nodes.map((node) => {
    if (node.type === "separator") return <DropdownMenuSeparator key={node.id} />
    const Icon = node.icon
    if (node.type === "submenu") {
      return (
        <DropdownMenuSub key={node.id}>
          <DropdownMenuSubTrigger disabled={node.disabled}>
            {Icon && <Icon aria-hidden />}
            <ItemLabel label={node.label} reason={node.disabledReason} />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            <EntityMenuItems nodes={node.items} onSelect={onSelect} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )
    }
    return (
      <DropdownMenuItem
        key={node.id}
        variant={node.destructive ? "destructive" : "default"}
        disabled={node.disabled}
        data-action={node.id}
        onClick={() => onSelect(node)}
      >
        {Icon && <Icon aria-hidden />}
        <ItemLabel label={node.label} reason={node.disabledReason} />
        {node.shortcut && <DropdownMenuShortcut>{node.shortcut}</DropdownMenuShortcut>}
      </DropdownMenuItem>
    )
  })
}

/**
 * Área que abre o menu com o botão direito, pressão longa (toque) ou tecla Menu / Shift+F10 (teclado).
 * `render` troca o `<div>` pelo elemento certo (ex.: `<TableRow />`). Sem ação visível, não intercepta o clique direito.
 */
export function EntityContextMenu({ children, render, className, ...props }: Omit<React.ComponentProps<typeof ContextMenuTrigger>, "children"> & { children?: React.ReactNode }) {
  const { nodes, select } = useController()
  const enabled = countItems(nodes) > 0
  return (
    <ContextMenu disabled={!enabled}>
      <ContextMenuTrigger render={render} className={cn("data-popup-open:bg-muted/50", className)} {...props}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <EntityMenuItems nodes={nodes} onSelect={select} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Botão "⋯" — o mesmo menu do clique direito, alcançável por Tab, Enter/Espaço e setas. */
export function EntityActionsButton({
  label = "Ações",
  className,
  size = "icon-sm",
  align = "end",
}: {
  /** Nome acessível (ex.: "Ações de Maria Souza"). */
  label?: string
  className?: string
  size?: "icon-xs" | "icon-sm" | "icon"
  align?: "start" | "center" | "end"
}) {
  const { nodes, select } = useController()
  if (countItems(nodes) === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size={size} aria-label={label} className={className} />}>
        <MoreHorizontal aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-auto min-w-52">
        <EntityMenuItems nodes={nodes} onSelect={select} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
