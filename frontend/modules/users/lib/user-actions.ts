import { KeyRound, PencilLine, ShieldCheck, UserCheck, UserX } from "lucide-react"

import type { RoleView, UserAccount } from "@/domain/types"
import type { EntityAction } from "@/shared/ui/entity-menu"

export interface UserActionHandlers {
  onEdit: () => void
  onEditRoles: () => void
  onResetPassword: () => void
  onSetActive: (active: boolean) => void | Promise<unknown>
  /** A conta é a do próprio usuário da sessão (não pode se desativar). */
  isSelf: boolean
}

/** Ações de um usuário. Nunca é apagado: desativar bloqueia o acesso e preserva o histórico. Tudo exige `users:manage`. */
export function userActions(account: UserAccount, handlers: UserActionHandlers): EntityAction[] {
  return [
    { id: "edit", label: "Editar usuário", icon: PencilLine, permission: "users:manage", onSelect: handlers.onEdit },
    { id: "roles", label: "Alterar papéis", icon: ShieldCheck, permission: "users:manage", onSelect: handlers.onEditRoles },
    { id: "password", label: "Redefinir senha", icon: KeyRound, permission: "users:manage", onSelect: handlers.onResetPassword },
    { id: "copy-email", label: "Copiar e-mail", kind: "copy", text: account.email, group: "clipboard" },
    { id: "copy-id", label: "Copiar ID", kind: "copy", text: account.id, group: "clipboard" },
    account.active
      ? {
          id: "deactivate",
          label: "Desativar usuário",
          icon: UserX,
          permission: "users:manage",
          disabled: handlers.isSelf && "Você não pode desativar o próprio acesso.",
          destructive: true,
          confirm: {
            title: `Desativar ${account.name}?`,
            description:
              "As sessões abertas são encerradas e o acesso é bloqueado. O histórico e a auditoria continuam apontando para este usuário, e ele pode ser reativado depois. A clínica precisa manter ao menos um administrador ativo.",
            confirmLabel: "Desativar",
          },
          onSelect: () => handlers.onSetActive(false),
        }
      : { id: "reactivate", label: "Reativar usuário", icon: UserCheck, permission: "users:manage", group: "status", onSelect: () => handlers.onSetActive(true) },
  ]
}

/** Ações de um papel na matriz: ver as permissões (leitura) e editá-las (`users:manage`). */
export function roleActions(role: Pick<RoleView, "key" | "label">, handlers: { onViewPermissions: () => void; onEditPermissions: () => void }): EntityAction[] {
  return [
    { id: "view", label: "Ver permissões", icon: ShieldCheck, onSelect: handlers.onViewPermissions },
    { id: "edit", label: "Editar permissões", icon: PencilLine, permission: "users:manage", hidden: role.key === "admin", onSelect: handlers.onEditPermissions },
    { id: "copy-key", label: "Copiar chave do papel", kind: "copy", text: role.key, group: "clipboard" },
  ]
}
