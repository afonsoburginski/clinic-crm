import { can } from "@/domain/permissions"
import type { Role, User } from "@/domain/types"

import { buildMenu, type EntityAction, type ItemNode, type MenuNode } from "./lib/build-menu"

/** Usuário de teste com os papéis dados (permissões padrão dos papéis). */
export const userWith = (roles: Role[], extra: Partial<User> = {}): User => ({ id: "u-1", name: "Teste", email: "t@t.com", title: "", roles, ...extra })

/** O menu que `user` enxerga para essas ações (mesma resolução do clique direito e do "⋯"). */
export const menuFor = (actions: EntityAction[], user: User | null | undefined): MenuNode[] => buildMenu(actions, (permission) => can(user, permission))

const flat = (nodes: MenuNode[]): ItemNode[] => nodes.flatMap((node) => (node.type === "item" ? [node] : node.type === "submenu" ? flat(node.items) : []))

/** Ids das ações acionáveis (inclusive dentro de submenus) que o usuário vê. */
export const visibleIds = (actions: EntityAction[], user: User | null | undefined) => flat(menuFor(actions, user)).map((node) => node.id)

/** O item `id` como o usuário o vê (ou `undefined` se não aparece). */
export const itemFor = (actions: EntityAction[], user: User | null | undefined, id: string) => flat(menuFor(actions, user)).find((node) => node.id === id)
