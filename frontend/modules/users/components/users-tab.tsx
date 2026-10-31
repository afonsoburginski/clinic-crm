"use client"

import { Plus } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { ROLE_LABELS } from "@/domain/permissions"
import type { UserAccount } from "@/domain/types"
import { useCan, useCurrentUser } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { useUrlEditor } from "@/shared/lib/use-url-dialog"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { ActivePill, StatePill } from "@/shared/ui/atoms/state-pill"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { userActions } from "../lib/user-actions"
import { useRoles, useSetUserActive, useUsers } from "../queries"
import { PasswordResetDialog } from "./password-reset-dialog"
import { UserFormDialog } from "./user-form-dialog"

const STATUS_OPTIONS = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
]

export function UsersTab() {
  const users = useUsers()
  const roles = useRoles()
  const { professional } = useLookups()
  const { user: me } = useCurrentUser()
  const setActive = useSetUserActive()
  const canManage = useCan("users:manage")
  const editor = useUrlEditor({ items: users.data, isLoading: users.isPending, allowed: canManage })
  const [passwordFor, setPasswordFor] = useState<UserAccount | null>(null)

  const roleLabel = useMemo(
    () => new Map((roles.data ?? []).map((role) => [role.key as string, role.label])),
    [roles.data]
  )
  const labelOf = (role: string) => roleLabel.get(role) ?? ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role

  const columns = useMemo<DataTableColumn<UserAccount>[]>(
    () => [
      {
        id: "user",
        header: "Usuário",
        accessorFn: (account) => account.name,
        meta: { label: "Usuário", alwaysVisible: true, searchValue: (account) => `${account.name} ${account.email}` },
        cell: ({ row: { original: account } }) => (
          <div className="flex items-center gap-3">
            <PersonAvatar name={account.name} />
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 font-medium">
                {account.name}
                {me?.id === account.id && <StatePill tone="info">Você</StatePill>}
              </span>
              <span className="text-xs text-muted-foreground">{account.email}</span>
            </div>
          </div>
        ),
      },
      {
        id: "roles",
        header: "Papéis",
        accessorFn: (account) => account.roles.map(labelOf).join(", "),
        meta: {
          label: "Papéis",
          searchValue: (account) => account.roles.map(labelOf).join(" "),
          filter: { kind: "multiselect", label: "Papel", options: (roles.data ?? []).map((role) => ({ value: role.key as string, label: role.label })), value: (account) => account.roles },
        },
        cell: ({ row: { original: account } }) => (
          <div className="flex flex-wrap gap-1.5">
            {account.roles.map((role) => (
              <StatePill key={role} tone="neutral">
                {labelOf(role)}
              </StatePill>
            ))}
          </div>
        ),
      },
      {
        id: "professional",
        header: "Profissional vinculado",
        accessorFn: (account) => (account.professionalId ? (professional.get(account.professionalId)?.name ?? "Profissional") : ""),
        meta: { label: "Profissional vinculado", hideBelow: "md", className: "text-muted-foreground" },
        cell: ({ row: { original: account } }) => (account.professionalId ? (professional.get(account.professionalId)?.name ?? "Profissional") : "—"),
      },
      {
        id: "status",
        header: "Situação",
        accessorFn: (account) => (account.active ? "Ativo" : "Inativo"),
        meta: { label: "Situação", filter: { kind: "status", label: "Situação", options: STATUS_OPTIONS, value: (account) => (account.active ? "active" : "inactive") } },
        cell: ({ row: { original: account } }) => <ActivePill active={account.active} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labelOf deriva de roleLabel
    [roleLabel, roles.data, professional, me?.id]
  )

  return (
    <SectionCard
      title="Usuários"
      description="Quem acessa o sistema, com quais papéis. Desativar preserva o histórico; usuários nunca são apagados."
      actions={
        <PermissionGate permission="users:manage">
          <Button onClick={editor.openNew}>
            <Plus data-icon="inline-start" aria-hidden />
            Novo usuário
          </Button>
        </PermissionGate>
      }
      bodyClassName="p-0"
    >
      <DataTable
        label="Usuários"
        tableKey="users"
        columns={columns}
        data={users.data ?? []}
        getRowId={(account) => account.id}
        defaultState={{ sort: [{ id: "user", desc: false }] }}
        searchPlaceholder="Buscar por nome ou e-mail…"
        isLoading={users.isPending}
        error={users.error}
        onRetry={() => users.refetch()}
        noun={["usuário", "usuários"]}
        rowLabel={(account) => account.name}
        rowActions={(account) =>
          userActions(account, {
            isSelf: me?.id === account.id,
            onEdit: () => editor.openEdit(account),
            onEditRoles: () => editor.openEdit(account),
            onResetPassword: () => setPasswordFor(account),
            onSetActive: (active) => setActive.mutate({ id: account.id, active }),
          })
        }
        empty={{ title: "Nenhum usuário cadastrado" }}
      />

      {(editor.creating || editor.editing) && (
        <UserFormDialog key={editor.editing?.id ?? "novo"} user={editor.editing} roles={roles.data} onClose={editor.close} />
      )}
      {passwordFor && <PasswordResetDialog user={passwordFor} onClose={() => setPasswordFor(null)} />}
    </SectionCard>
  )
}
