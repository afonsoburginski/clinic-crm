"use client"

import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { api } from "@/shared/api/demo-api"
import { useCan } from "@/shared/lib/current-user"
import { formatAge } from "@/shared/lib/format"
import { useUiStore } from "@/shared/lib/ui-store"

import { PersonAvatar } from "../atoms/person-avatar"

export function PatientQuickSearch() {
  const open = useUiStore((s) => s.quickSearchOpen)
  const setOpen = useUiStore((s) => s.setQuickSearchOpen)
  const toggle = useUiStore((s) => s.toggleQuickSearch)
  const router = useRouter()
  const canReadAll = useCan("patients:read")
  const canReadOwn = useCan("patients:read-own")
  const canSearch = canReadAll || canReadOwn

  const { data = [] } = useQuery({
    queryKey: ["patients", "list", { search: "", status: "all" }],
    queryFn: () => api.patients.list({ status: "all" }),
    enabled: open && canSearch,
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle])

  if (!canSearch) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-(--control-h) w-full max-w-sm items-center gap-2 rounded-lg border border-input bg-card/70 px-3 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate">Buscar paciente…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Buscar paciente" description="Nome, código ou CPF">
        <CommandInput placeholder="Nome, código ou CPF…" />
        <CommandList>
          <CommandEmpty>Nenhum paciente encontrado.</CommandEmpty>
          <CommandGroup heading="Pacientes">
            {data.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.fullName} ${p.code} ${p.socialName ?? ""} ${p.document ?? ""}`}
                onSelect={() => {
                  setOpen(false)
                  router.push(`/pacientes/${p.id}`)
                }}
              >
                <PersonAvatar name={p.fullName} size="sm" />
                <span className="flex flex-col">
                  <span>{p.socialName || p.fullName}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.code} · {formatAge(p.birthDate)}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
