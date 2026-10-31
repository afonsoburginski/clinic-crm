"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { useCan } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { ActivePill } from "@/shared/ui/atoms/state-pill"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { ProDot } from "@/shared/ui/atoms/pro-color"
import { EmptyState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SearchInput } from "@/shared/ui/molecules/search-input"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"
import { WEEKDAY_SHORT } from "@/shared/lib/format"

import { ProfessionalFormDialog } from "./professional-form-dialog"

type StatusFilter = "active" | "inactive" | "all"

export function ProfessionalsListView() {
  const { professionals, specialty, isLoading } = useLookups()
  const canManage = useCan("professionals:manage")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("active")
  const [creating, setCreating] = useState(false)

  const term = search.trim().toLowerCase()
  const visible = professionals
    .filter((p) => status === "all" || (status === "active" ? p.active : !p.active))
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.registry?.toLowerCase().includes(term))

  return (
    <>
      <PageHeader
        eyebrow="Clínica"
        title="Profissionais"
        description="Equipe de atendimento, especialidades, grade semanal e afastamentos."
        actions={
          canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus data-icon="inline-start" aria-hidden />
              Novo profissional
            </Button>
          )
        }
      />

      <Toolbar variant="bar" label="Filtros de profissionais">
        <ToolbarGroup className="w-full sm:max-w-xs">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome ou registro" label="Buscar profissionais" />
        </ToolbarGroup>
        <ToolbarGroup align="end">
          <HaloToggleGroup
            items={[
              { value: "active", label: "Ativos" },
              { value: "inactive", label: "Inativos" },
              { value: "all", label: "Todos" },
            ]}
            value={status}
            onValueChange={(v) => v && setStatus(v as StatusFilter)}
          />
        </ToolbarGroup>
      </Toolbar>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <EmptyState title="Nenhum profissional encontrado" description="Ajuste a busca ou o filtro de situação." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const days = [...new Set(p.schedule.map((s) => s.weekday))].sort()
            return (
              <li key={p.id}>
                <Link
                  href={`/profissionais/${p.id}`}
                  className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <div className="flex items-start gap-3">
                    <PersonAvatar name={p.name} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 font-medium">
                        <ProDot colorIndex={p.colorIndex} />
                        <span className="truncate">{p.name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{p.registry || "Sem registro informado"}</span>
                    </div>
                    <ActivePill active={p.active} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.specialtyIds.map((id) => (
                      <span key={id} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                        {specialty.get(id)?.name ?? "—"}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto flex gap-1" aria-label="Dias de atendimento">
                    {WEEKDAY_SHORT.map((label, day) => (
                      <span
                        key={label}
                        className={
                          days.includes(day)
                            ? "flex-1 rounded-md bg-primary/10 py-1 text-center text-[11px] font-medium text-primary"
                            : "flex-1 rounded-md bg-muted py-1 text-center text-[11px] text-muted-foreground/60"
                        }
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {creating && <ProfessionalFormDialog onClose={() => setCreating(false)} />}
    </>
  )
}
