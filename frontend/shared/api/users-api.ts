import { passwordResetSchema, userCreateSchema, userUpdateSchema, type PasswordResetInput, type UserCreateInput, type UserUpdateInput } from "@/domain/schemas"
import type { PermissionGroup, RoleView, UserAccount } from "@/domain/types"

import type { Row } from "./backend-mappers"
import { items, parse, seg } from "./helpers"
import { http } from "./http-client"
import { toPermissionGroups, toRoleView, toUserAccount } from "./user-mappers"
import { invalidateUserNames } from "./user-directory"

const NOT_FOUND = { 404: "Usuário não encontrado." }

/** A API trata `""` e `null` como "sem vínculo"; o formulário usa `""`. */
const professionalOf = (id: string) => (id ? id : null)

export const usersApi = {
  async list(): Promise<UserAccount[]> {
    return (await items("/users")).map(toUserAccount)
  },

  async create(input: UserCreateInput): Promise<UserAccount> {
    const data = parse<UserCreateInput>(userCreateSchema, input)
    const created = await http.post<Row>("/users", {
      body: { ...data, professionalId: professionalOf(data.professionalId) },
      errors: { 409: "Já existe um usuário com este e-mail." },
    })
    invalidateUserNames()
    return toUserAccount(created)
  },

  /** Nome, e-mail, vínculo, situação e papéis em uma só chamada; a API aplica tudo na mesma transação. */
  async update(id: string, input: UserUpdateInput): Promise<UserAccount> {
    const data = parse<UserUpdateInput>(userUpdateSchema, input)
    const updated = await http.patch<Row>(`/users/${seg(id)}`, {
      body: { ...data, professionalId: professionalOf(data.professionalId) },
      errors: NOT_FOUND,
    })
    invalidateUserNames()
    return toUserAccount(updated)
  },

  /** Desativar encerra as sessões do usuário; não apaga nada (a auditoria aponta para ele). */
  async setActive(id: string, active: boolean): Promise<UserAccount> {
    const updated = await http.patch<Row>(`/users/${seg(id)}`, { body: { active }, errors: NOT_FOUND })
    invalidateUserNames()
    return toUserAccount(updated)
  },

  async resetPassword(id: string, input: PasswordResetInput): Promise<void> {
    const data = parse<PasswordResetInput>(passwordResetSchema, input)
    await http.post(`/users/${seg(id)}/password`, { body: { password: data.password }, errors: NOT_FOUND })
  },
}

export const rolesApi = {
  async list(): Promise<RoleView[]> {
    return (await items("/roles")).map(toRoleView)
  },

  async catalog(): Promise<PermissionGroup[]> {
    return toPermissionGroups(await items("/permissions"))
  },

  /** Substitui as permissões do papel; a API recusa chave desconhecida e o que trancaria o administrador. */
  async setPermissions(roleKey: string, permissions: string[]): Promise<RoleView> {
    return toRoleView(
      await http.put<Row>(`/roles/${seg(roleKey)}/permissions`, {
        body: { permissions },
        errors: { 404: "Papel não encontrado." },
      })
    )
  },
}
