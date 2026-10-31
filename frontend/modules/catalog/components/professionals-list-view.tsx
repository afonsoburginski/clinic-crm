"use client"

import { Plus, Stethoscope } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import type { Professional } from "@/domain/types"
import { useCan } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { ActivePill } from "@/shared/ui/atoms/state-pill"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { ProDot } from "@/shared/ui/atoms/pro-color"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { WEEKDAY_SHORT } from "@/shared/lib/format"

import { professionalActions } from "../lib/professional-actions"
import { useSetProfessionalActive } from "../queries"
import { ProfessionalFormDialog } from "./professional-form-dialog"

const STATUS_OPTIONS = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
]

export function ProfessionalsListView() {
  const router = useRouter()
  const { professionals, specialties, specialty, isLoading } = useLookups()
  const canManage = useCan("professionals:manage")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Professional | null>(null)
  const setActive = useSetProfessionalActive()

  const columns = useMemo<DataTableColumn<Professional>[]>(
    () => [
      {
        id: "name",
        header: "Profissional",
        accessorFn: (p) => p.name,
        meta: { label: "Profissional", alwaysVisible: true, searchValue: (p) => `${p.name} ${p.registry ?? ""}` },
        cell: ({ row: { original: p } }) => (
          <div className="flex items-center gap-3">
            <PersonAvatar name={p.name} size="sm" />
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/profissionais/${p.id}`}
                className="flex items-center gap-2 truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                <ProDot colorIndex={p.colorIndex} />
                <span className="truncate">{p.name}</span>
              </Link>
              <span className="text-xs text-muted-foreground">{p.registry || "Sem registro informado"}</span>
            </div>
          </div>
        ),
      },
      {
        id: "specialties",
        header: "Especialidades",
        accessorFn: (p) => p.specialtyIds.map((id) => specialty.get(id)?.name ?? "").join(", "),
        meta: {
          label: "Especialidades",
          hideBelow: "sm",
          searchValue: (p) => p.specialtyIds.map((id) => specialty.get(id)?.name ?? "").join(" "),
          filter: {
            kind: "multiselect",
            label: "Especialidade",
            options: specialties.map((s) => ({ value: s.id, label: s.name })),
            value: (p) => p.specialtyIds,
          },
        },
        cell: ({ row: { original: p } }) => (
          <div className="flex flex-wrap gap-1.5">
            {p.specialtyIds.map((id) => (
              <span key={id} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {specialty.get(id)?.name ?? "—"}
              </span>
            ))}
          </div>
        ),
      },
      {
        id: "days",
        header: "Dias de atendimento",
        enableSorting: false,
        meta: {
          label: "Dias de atendimento",
          hideBelow: "lg",
          filter: {
            kind: "multiselect",
            label: "Dia de atendimento",
            options: WEEKDAY_SHORT.map((label, day) => ({ value: String(day), label })),
            value: (p) => [...new Set(p.schedule.map((s) => String(s.weekday)))],
          },
        },
        cell: ({ row: { original: p } }) => {
          const days = new Set(p.schedule.map((s) => s.weekday))
          return (
            <div className="flex gap-1" aria-label="Dias de atendimento">
              {WEEKDAY_SHORT.map((label, day) => (
                <span
                  key={label}
                  className={
                    days.has(day)
                      ? "w-9 rounded-md bg-primary/10 py-1 text-center text-[11px] font-medium text-primary"
                      : "w-9 rounded-md bg-muted py-1 text-center text-[11px] text-muted-foreground/60"
                  }
                >
                  {label}
                </span>
              ))}
            </div>
          )
        },
      },
      {
        id: "status",
        header: "Situação",
        accessorFn: (p) => (p.active ? "Ativo" : "Inativo"),
        meta: {
          label: "Situação",
          align: "right",
          filter: { kind: "status", label: "Situação", options: STATUS_OPTIONS, value: (p) => (p.active ? "active" : "inactive") },
        },
        cell: ({ row: { original: p } }) => <ActivePill active={p.active} />,
      },
    ],
    [specialty, specialties]
  )

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

      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Profissionais"
          tableKey="professionals"
          columns={columns}
          data={professionals}
          getRowId={(p) => p.id}
          defaultState={{ filters: { status: ["active"] }, sort: [{ id: "name", desc: false }] }}
          searchPlaceholder="Buscar por nome ou registro"
          isLoading={isLoading}
          noun={["profissional", "profissionais"]}
          empty={{ icon: <Stethoscope aria-hidden />, title: "Nenhum profissional cadastrado" }}
          onRowClick={(p) => router.push(`/profissionais/${p.id}`)}
          rowLabel={(p) => p.name}
          rowActions={(p) =>
            professionalActions(p, {
              onView: () => router.push(`/profissionais/${p.id}`),
              onEdit: () => setEditing(p),
              onSetActive: (active) => setActive.mutate({ professional: p, active }),
            })
          }
        />
      </SectionCard>

      {creating && <ProfessionalFormDialog onClose={() => setCreating(false)} />}
      {editing && <ProfessionalFormDialog professional={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
