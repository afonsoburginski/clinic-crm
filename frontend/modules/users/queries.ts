"use client"

import { useQuery } from "@tanstack/react-query"

import type { PasswordResetInput, UserCreateInput, UserUpdateInput } from "@/domain/schemas"
import type { RoleView, UserAccount } from "@/domain/types"
import { api } from "@/shared/api/api"
import { notifySuccess } from "@/shared/lib/notify"
import { useApiMutation } from "@/shared/lib/use-api-mutation"

export const usersKeys = {
  all: ["users"] as const,
  roles: ["users", "roles"] as const,
  catalog: ["users", "permission-catalog"] as const,
}

export function useUsers(enabled = true) {
  return useQuery({ queryKey: usersKeys.all, queryFn: () => api.users.list(), enabled, retry: false })
}

export function useRoles(enabled = true) {
  return useQuery({ queryKey: usersKeys.roles, queryFn: () => api.roles.list(), enabled, retry: false })
}

export function usePermissionCatalog(enabled = true) {
  return useQuery({ queryKey: usersKeys.catalog, queryFn: () => api.roles.catalog(), enabled, retry: false, staleTime: 5 * 60_000 })
}

/** Criar ou editar: a edição leva nome, e-mail, vínculo, situação e papéis na mesma chamada. */
export function useSaveUser(id?: string) {
  return useApiMutation<UserCreateInput | UserUpdateInput, UserAccount>(
    (input) => (id ? api.users.update(id, input as UserUpdateInput) : api.users.create(input as UserCreateInput)),
    { invalidate: [usersKeys.all], success: id ? "Usuário atualizado." : "Usuário criado." }
  )
}

export function useSetUserActive() {
  return useApiMutation(({ id, active }: { id: string; active: boolean }) => api.users.setActive(id, active), {
    invalidate: [usersKeys.all],
    success: (_user, { active }) => (active ? "Usuário reativado." : "Usuário desativado."),
  })
}

export function useResetPassword(id: string) {
  return useApiMutation((input: PasswordResetInput) => api.users.resetPassword(id, input), {
    invalidate: [usersKeys.all],
    success: "Senha redefinida. As sessões do usuário foram encerradas.",
  })
}

/**
 * Salva a matriz: um PUT por papel alterado. Depois, a sessão do usuário atual é relida, porque a alteração
 * pode ter mudado as permissões dele. Falha parcial avisa quais papéis foram gravados.
 */
export function useSaveRoleMatrix() {
  return useApiMutation<{ roles: { key: string; permissions: string[] }[] }, RoleView[]>(
    async ({ roles }) => {
      const saved: RoleView[] = []
      for (const role of roles) {
        try {
          saved.push(await api.roles.setPermissions(role.key, role.permissions))
        } catch (error) {
          if (saved.length) notifySuccess(`Papéis já salvos: ${saved.map((r) => r.label).join(", ")}.`)
          throw error
        }
      }
      return saved
    },
    { invalidate: [usersKeys.all, ["auth", "me"]], success: "Permissões salvas." }
  )
}

