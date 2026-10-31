"use client"

import { Lock } from "lucide-react"
import { Fragment, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PERMISSION_GROUPS, PERMISSION_LABELS, PERMISSIONS } from "@/domain/permissions"
import { cellLock, changedRoles, isGranted, matrixOf, permissionList, toggleCell, type RoleMatrix } from "@/domain/roles-matrix"
import type { PermissionGroup, RoleView } from "@/domain/types"
import { useCan } from "@/shared/lib/current-user"
import { ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { usePermissionCatalog, useRoles, useSaveRoleMatrix } from "../queries"

/** O catálogo da API é a fonte; sem ele a matriz usa os rótulos locais, na mesma ordem. */
function fallbackCatalog(): PermissionGroup[] {
  return PERMISSION_GROUPS.map((group) => ({
    group,
    permissions: PERMISSIONS.filter((p) => PERMISSION_LABELS[p].group === group).map((p) => ({ key: p, label: PERMISSION_LABELS[p].label, group })),
  }))
}

export function RolesTab() {
  const roles = useRoles()
  const catalog = usePermissionCatalog()

  if (roles.isPending || catalog.isPending) {
    return (
      <SectionCard title="Papéis e permissões">
        <ListSkeleton rows={6} />
      </SectionCard>
    )
  }
  if (roles.isError) return <ErrorState error={roles.error} onRetry={() => roles.refetch()} />

  // `key` troca quando o servidor devolve outra matriz (após salvar): o rascunho local recomeça dela.
  const signature = JSON.stringify(roles.data.map((r) => [r.key, [...r.permissions].sort()]))
  return <RoleMatrixEditor key={signature} roles={roles.data} groups={catalog.data?.length ? catalog.data : fallbackCatalog()} />
}

function RoleMatrixEditor({ roles, groups }: { roles: RoleView[]; groups: PermissionGroup[] }) {
  const canManage = useCan("users:manage")
  const save = useSaveRoleMatrix()
  const saved = useMemo(() => matrixOf(roles), [roles])
  const [draft, setDraft] = useState<RoleMatrix>(saved)
  const changed = changedRoles(saved, draft)
  const labelOf = new Map(roles.map((r) => [r.key as string, r.label]))

  function submit() {
    save.mutate({ roles: changed.map((key) => ({ key, permissions: permissionList(draft[key]) })) })
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Papéis e permissões"
        description={
          canManage
            ? "Marque o que cada papel pode fazer. O usuário recebe a união das permissões dos papéis dele."
            : "Matriz de leitura: só quem gere usuários altera as permissões dos papéis."
        }
        bodyClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-64 px-5">Permissão</TableHead>
              {roles.map((role) => (
                <TableHead key={role.key} className="text-center">
                  <span className="block font-medium">{role.label}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {role.userCount} {role.userCount === 1 ? "usuário" : "usuários"}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <Fragment key={group.group}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={roles.length + 1} className="px-5 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.group}
                  </TableCell>
                </TableRow>
                {group.permissions.map((permission) => (
                  <TableRow key={permission.key}>
                    <TableCell className="px-5 py-2.5 whitespace-normal">
                      <span className="block text-sm">{permission.label}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{permission.key}</span>
                    </TableCell>
                    {roles.map((role) => {
                      const lock = cellLock(role.key, permission.key)
                      const checked = lock ? lock.checked : isGranted(draft, role.key, permission.key)
                      const label = `${permission.label} — ${role.label}`
                      return (
                        <TableCell key={role.key} className="text-center">
                          <span className="inline-flex items-center justify-center gap-1.5" title={lock?.reason}>
                            <Checkbox
                              aria-label={label}
                              checked={checked}
                              disabled={!canManage || !!lock}
                              onCheckedChange={(next) => setDraft((m) => toggleCell(m, role.key, permission.key, next === true))}
                            />
                            {lock && (
                              <>
                                <Lock className="size-3 text-muted-foreground" aria-hidden />
                                <span className="sr-only">{lock.reason}</span>
                              </>
                            )}
                          </span>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        <p className="border-t px-5 py-3 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mr-1 inline size-3 align-[-1px]" aria-hidden />
          Regras travadas: o Administrador nunca tem acesso clínico (gestão administrativa não implica acesso a prontuários) e
          sempre mantém o acesso a usuários e configurações. Mudanças valem para quem já está logado na próxima leitura da sessão.
        </p>
      </SectionCard>

      {canManage && (
        <div className="glass-bar sticky bottom-3 z-20 flex items-center justify-end gap-3 rounded-xl border px-4 py-3 shadow-xs">
          {changed.length > 0 && (
            <span className="mr-auto text-sm text-muted-foreground">
              Alterações não salvas em: {changed.map((key) => labelOf.get(key) ?? key).join(", ")}
            </span>
          )}
          <Button variant="ghost" disabled={!changed.length || save.isPending} onClick={() => setDraft(saved)}>
            Descartar
          </Button>
          <Button disabled={!changed.length || save.isPending} onClick={submit}>
            {save.isPending ? "Salvando…" : "Salvar permissões"}
          </Button>
        </div>
      )}
    </div>
  )
}

