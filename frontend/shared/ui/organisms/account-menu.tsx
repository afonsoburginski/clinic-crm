"use client"

import { useQueryClient } from "@tanstack/react-query"
import { CircleHelp, ChevronsUpDown, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ROLE_LABELS } from "@/domain/permissions"
import type { User } from "@/domain/types"
import { api } from "@/shared/api/api"
import { useUiStore } from "@/shared/lib/ui-store"
import { PersonAvatar } from "../atoms/person-avatar"

export function AccountMenu({ user }: { user: User | null }) {
  const closeOverlays = useUiStore((s) => s.closeAll)
  const openTour = useUiStore((s) => s.setTourOpen)
  const router = useRouter()
  const client = useQueryClient()

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
            <DropdownMenuItem onClick={() => { closeOverlays(); void api.auth.signOut(); client.clear(); router.replace("/entrar") }}><LogOut aria-hidden />Trocar de perfil / sair</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
