import type { LucideIcon } from "lucide-react"

import type { Permission } from "@/domain/permissions"

/**
 * Definição declarativa das ações de uma entidade (linha de tabela, card, cabeçalho de coluna).
 * A MESMA lista alimenta o clique direito e o botão "⋯": `buildMenu` resolve permissões, visibilidade,
 * grupos e submenus uma única vez, e os dois componentes só desenham o resultado.
 */

export interface ActionConfirm {
  title: string
  description?: string
  confirmLabel?: string
  /** Pede um texto de motivo; ele chega ao `onSelect(reason)`. */
  reason?: { label: string; required?: boolean }
}

interface ActionBase {
  /** Estável por entidade (também é a `key` do item e serve nos testes). */
  id: string
  /** Rótulo pt-BR. */
  label: string
  icon?: LucideIcon
  /** Qualquer uma das permissões libera a ação; sem permissão ela some do menu (não só desabilita). */
  permission?: Permission | readonly Permission[]
  /** Regra de negócio: a ação não se aplica a este item (ex.: lançamento cancelado não recebe pagamento). */
  hidden?: boolean
  /** Mostra a ação desabilitada. Texto = motivo, exibido como dica do item. */
  disabled?: boolean | string
  /** Itens de grupos diferentes são separados por uma linha; a ordem é a da primeira aparição. */
  group?: string
  shortcut?: string
}

export type CommandAction = ActionBase & {
  kind?: "command"
  onSelect: (reason?: string) => void | Promise<unknown>
} & (
    | { destructive?: false; confirm?: ActionConfirm }
    /** Ação destrutiva sempre passa pelo ConfirmDialog. */
    | { destructive: true; confirm: ActionConfirm }
  )

export interface CopyAction extends ActionBase {
  kind: "copy"
  /** Texto que vai para a área de transferência. */
  text: string
  /** Toast de sucesso (padrão: "<rótulo sem 'Copiar '> copiado."). */
  successMessage?: string
}

export interface SubmenuAction extends ActionBase {
  kind: "submenu"
  items: readonly EntityAction[]
}

export type EntityAction = CommandAction | CopyAction | SubmenuAction

export type ItemNode = {
  type: "item"
  id: string
  label: string
  icon?: LucideIcon
  shortcut?: string
  disabled: boolean
  disabledReason?: string
  destructive: boolean
  action: CommandAction | CopyAction
}

export type MenuNode =
  | ItemNode
  | { type: "separator"; id: string }
  | { type: "submenu"; id: string; label: string; icon?: LucideIcon; disabled: boolean; disabledReason?: string; items: MenuNode[] }

/** Grupo das ações destrutivas sem grupo explícito: sempre por último, separado das demais. */
export const DANGER_GROUP = "danger"

const DEFAULT_GROUP = "main"

function allowed(permission: ActionBase["permission"], can: (permission: Permission) => boolean) {
  if (permission === undefined) return true
  return (Array.isArray(permission) ? (permission as readonly Permission[]) : [permission as Permission]).some(can)
}

function groupOf(action: EntityAction) {
  if (action.group) return action.group
  return "destructive" in action && action.destructive ? DANGER_GROUP : DEFAULT_GROUP
}

function resolve(action: EntityAction, can: (permission: Permission) => boolean): MenuNode | null {
  if (action.hidden || !allowed(action.permission, can)) return null
  const disabled = !!action.disabled
  const disabledReason = typeof action.disabled === "string" ? action.disabled : undefined
  if (action.kind === "submenu") {
    const items = buildMenu(action.items, can)
    return items.length ? { type: "submenu", id: action.id, label: action.label, icon: action.icon, disabled, disabledReason, items } : null
  }
  return {
    type: "item",
    id: action.id,
    label: action.label,
    icon: action.icon,
    shortcut: action.shortcut,
    disabled,
    disabledReason,
    destructive: action.kind !== "copy" && "destructive" in action && !!action.destructive,
    action,
  }
}

/**
 * Filtra por permissão e regra de negócio, agrupa (separador entre grupos, nunca no início/fim) e descarta submenus vazios.
 * `can` recebe a permissão e responde se o usuário da sessão a tem.
 */
export function buildMenu(actions: readonly EntityAction[], can: (permission: Permission) => boolean): MenuNode[] {
  const groups = new Map<string, MenuNode[]>()
  for (const action of actions) {
    const node = resolve(action, can)
    if (!node) continue
    const key = groupOf(action)
    groups.set(key, [...(groups.get(key) ?? []), node])
  }
  const danger = groups.get(DANGER_GROUP)
  groups.delete(DANGER_GROUP)
  const ordered = [...groups.values(), ...(danger ? [danger] : [])]
  return ordered.flatMap((nodes, index) => (index === 0 ? nodes : [{ type: "separator" as const, id: `separator-${index}` }, ...nodes]))
}

/** Como a seleção de um item é tratada: copiar, confirmar antes (destrutiva, ou com `confirm`) ou executar direto. */
export function intentOf(node: ItemNode): "copy" | "confirm" | "run" {
  if (node.action.kind === "copy") return "copy"
  return node.action.confirm || node.destructive ? "confirm" : "run"
}

/** Confirmação de um item: ação destrutiva sem texto próprio recebe um padrão seguro. */
export function confirmOf(node: ItemNode): ActionConfirm {
  const action = node.action
  if (action.kind === "copy") throw new Error("copy actions have no confirmation")
  return action.confirm ?? { title: `${node.label}?`, confirmLabel: node.label }
}

/** Mensagem do toast de uma ação "copiar": "Copiar código" → "Código copiado.". */
export function copiedMessage(action: CopyAction): string {
  if (action.successMessage) return action.successMessage
  const subject = action.label.replace(/^copiar\s+/i, "").trim()
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} copiado.`
}

/** Quantidade de itens acionáveis (sem separadores); submenus contam pelo que têm dentro. */
export function countItems(nodes: readonly MenuNode[]): number {
  return nodes.reduce((total, node) => total + (node.type === "item" ? 1 : node.type === "submenu" ? countItems(node.items) : 0), 0)
}
