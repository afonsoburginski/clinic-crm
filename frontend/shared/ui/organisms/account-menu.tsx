"use client"

import { useQueryClient } from "@tanstack/react-query"
import { CircleHelp, ChevronsUpDown, LogOut, RotateCcw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { can, ROLE_LABELS } from "@/domain/permissions"
import type { User } from "@/domain/types"
import { api } from "@/shared/api/demo-api"
import { notifyError, notifySuccess } from "@/shared/lib/notify"
import { useUiStore } from "@/shared/lib/ui-store"
import { PersonAvatar } from "../atoms/person-avatar"
import { ConfirmDialog } from "../molecules/confirm-dialog"

export function AccountMenu({ user }: { user: User | null }) {
  const resetting = useUiStore((s) => s.demoResetOpen)
  const setResetting = useUiStore((s) => s.setDemoResetOpen)
  const closeOverlays = useUiStore((s) => s.closeAll)
  const openTour = useUiStore((s) => s.setTourOpen)
  const [pending, setPending] = useState(false)
  const router = useRouter()
  const client = useQueryClient()

  async function resetDemo() {
    setPending(true)
    try {
      await api.auth.resetDemo({ confirm: true })
      await client.invalidateQueries()
      notifySuccess("Dados de demonstração restaurados")
      setResetting(false)
    } catch (error) {
      notifyError(error)
    } finally {
      setPending(false)
    }
  }

  if (!user) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" className="h-auto w-full justify-start gap-2.5 px-2 py-2" aria-label="Menu da conta" />}>
          <PersonAvatar name={user.name} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
            <span className="w-full truncate text-left text-sm font-medium">{user.name}</span>
            <span className="w-full truncate text-left text-[11px] text-muted-foreground">{user.roles.map((r) => ROLE_LABELS[r]).join(" · ")}</span>
          </span>
          <ChevronsUpDown aria-hidden className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-60">
          <DropdownMenuGroup><DropdownMenuLabel className="flex flex-col gap-0.5"><span className="text-foreground">{user.name}</span><span className="text-xs font-normal">{user.email}</span></DropdownMenuLabel></DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => openTour(true)}><CircleHelp aria-hidden />Rever orientação do painel</DropdownMenuItem>
            {can(user, "settings:manage") && <DropdownMenuItem onClick={() => setResetting(true)}><RotateCcw aria-hidden />Restaurar dados de demonstração</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => { closeOverlays(); void api.auth.signOut(); client.clear(); router.replace("/entrar") }}><LogOut aria-hidden />Trocar de perfil / sair</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={resetting} onOpenChange={setResetting} title="Restaurar dados de demonstração?" description="Os dados locais de demonstração (prontuários, avaliações, plano ABA, financeiro e documentos) voltam ao estado inicial. Pacientes, agenda e cadastros ficam no servidor e não são afetados. Não dá para desfazer." confirmLabel="Restaurar" destructive pending={pending} onConfirm={resetDemo} />
    </>
  )
}
