"use client"

import { KeyRound, Pencil, Plus, UserCheck, UserX } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ROLE_LABELS } from "@/domain/permissions"
import type { UserAccount } from "@/domain/types"
import { useCurrentUser } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { ActivePill, StatePill } from "@/shared/ui/atoms/state-pill"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"
import { SearchInput } from "@/shared/ui/molecules/search-input"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { useRoles, useSetUserActive, useUsers } from "../queries"
import { PasswordResetDialog } from "./password-reset-dialog"
import { UserFormDialog } from "./user-form-dialog"

export function UsersTab() {
  const users = useUsers()
  const roles = useRoles()
  const { professional } = useLookups()
  const { user: me } = useCurrentUser()
  const setActive = useSetUserActive()
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<{ user?: UserAccount } | null>(null)
  const [passwordFor, setPasswordFor] = useState<UserAccount | null>(null)
  const [deactivating, setDeactivating] = useState<UserAccount | null>(null)

  const roleLabel = useMemo(
    () => new Map((roles.data ?? []).map((role) => [role.key as string, role.label])),
    [roles.data]
  )
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (users.data ?? []).filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users.data, search])

  return (
    <SectionCard
      title="Usuários"
      description="Quem acessa o sistema, com quais papéis. Desativar preserva o histórico; usuários nunca são apagados."
      actions={
        <PermissionGate permission="users:manage">
          <Button onClick={() => setEditing({})}>
            <Plus data-icon="inline-start" aria-hidden />
            Novo usuário
          </Button>
        </PermissionGate>
      }
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome ou e-mail…" label="Buscar usuários" />
        {users.data && (
          <span className="ml-auto text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "usuário" : "usuários"}
          </span>
        )}
      </div>

      {users.isPending ? (
        <div className="p-5">
          <ListSkeleton rows={5} />
        </div>
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
          description={search ? "Ajuste a busca para ver outros usuários." : undefined}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-5">Usuário</TableHead>
              <TableHead>Papéis</TableHead>
              <TableHead>Profissional vinculado</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="px-5 text-right">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="px-5 py-3">
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
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {account.roles.map((role) => (
                      <StatePill key={role} tone="neutral">
                        {roleLabel.get(role) ?? ROLE_LABELS[role]}
                      </StatePill>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {account.professionalId ? (professional.get(account.professionalId)?.name ?? "Profissional") : "—"}
                </TableCell>
                <TableCell>
                  <ActivePill active={account.active} />
                </TableCell>
                <TableCell className="px-5 text-right">
                  <PermissionGate permission="users:manage">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Editar ${account.name}`} onClick={() => setEditing({ user: account })}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Redefinir a senha de ${account.name}`} onClick={() => setPasswordFor(account)}>
                        <KeyRound aria-hidden />
                      </Button>
                      {account.active ? (
                        <Button variant="ghost" size="icon-sm" aria-label={`Desativar ${account.name}`} onClick={() => setDeactivating(account)}>
                          <UserX aria-hidden />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Reativar ${account.name}`}
                          disabled={setActive.isPending}
                          onClick={() => setActive.mutate({ id: account.id, active: true })}
                        >
                          <UserCheck aria-hidden />
                        </Button>
                      )}
                    </div>
                  </PermissionGate>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && <UserFormDialog user={editing.user} roles={roles.data} onClose={() => setEditing(null)} />}
      {passwordFor && <PasswordResetDialog user={passwordFor} onClose={() => setPasswordFor(null)} />}
      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Desativar ${deactivating?.name ?? "usuário"}?`}
        description="As sessões abertas são encerradas e o acesso é bloqueado. O histórico e a auditoria continuam apontando para este usuário, e ele pode ser reativado depois. A clínica precisa manter ao menos um administrador ativo."
        confirmLabel="Desativar"
        destructive
        pending={setActive.isPending}
        onConfirm={() => {
          if (deactivating) setActive.mutate({ id: deactivating.id, active: false }, { onSettled: () => setDeactivating(null) })
        }}
      />
    </SectionCard>
  )
}
