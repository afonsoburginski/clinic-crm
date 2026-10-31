"use client"

import { UserRoundPlus, UsersRound } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useDeferredValue, useState } from "react"

import { buttonVariants } from "@/components/ui/button"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { PatientStatus } from "@/domain/types"
import { formatAge, formatBirthDate } from "@/shared/lib/format"
import { useCan } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { ProDot } from "@/shared/ui/atoms/pro-color"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SearchInput } from "@/shared/ui/molecules/search-input"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { ListFooter, Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

import { usePatients } from "../queries"
import { PatientStatusPill } from "./patient-status-pill"

const FILTERS: { value: PatientStatus | "all"; label: string }[] = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "archived", label: "Arquivados" },
  { value: "all", label: "Todos" },
]

export function PatientsListView() {
  const router = useRouter()
  const canWrite = useCan("patients:write")
  const canReadAll = useCan("patients:read")
  const { professional } = useLookups()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<PatientStatus | "all">("active")
  const deferredSearch = useDeferredValue(search)
  const { data, isLoading, error, refetch, isPlaceholderData } = usePatients({ search: deferredSearch, status })

  return (
    <>
      <PageHeader
        title="Pacientes"
        description={canReadAll ? "Cadastro central de pacientes da clínica." : "Pacientes que você atende."}
        actions={
          canWrite && (
            <Link href="/pacientes/novo" className={buttonVariants()}>
              <UserRoundPlus aria-hidden />
              Novo paciente
            </Link>
          )
        }
      />

      <SectionCard bodyClassName="p-0">
        <Toolbar label="Filtros de pacientes">
          <ToolbarGroup className="w-full sm:max-w-xs">
            <SearchInput value={search} onChange={setSearch} placeholder="Nome, código ou CPF" label="Buscar pacientes" />
          </ToolbarGroup>
          <ToolbarGroup align="end">
            <HaloToggleGroup items={FILTERS} value={status} onValueChange={(v) => v && setStatus(v as PatientStatus | "all")} />
          </ToolbarGroup>
        </Toolbar>

        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} className="m-4" />
        ) : isLoading ? (
          <ListSkeleton rows={8} className="p-4" />
        ) : !data?.length ? (
          <EmptyState
            icon={<UsersRound aria-hidden />}
            title={search ? "Nenhum paciente encontrado" : "Nenhum paciente nesta situação"}
            description={search ? "Tente outro nome, código ou CPF." : undefined}
            className="m-4"
          />
        ) : (
          <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Paciente</TableHead>
                  <TableHead className="hidden md:table-cell">Nascimento</TableHead>
                  <TableHead className="hidden lg:table-cell">Profissional de referência</TableHead>
                  <TableHead className="hidden sm:table-cell">Contato</TableHead>
                  <TableHead className="pr-5 text-right">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p) => {
                  const pro = p.mainProfessionalId ? professional.get(p.mainProfessionalId) : undefined
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/pacientes/${p.id}`)}
                    >
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          <PersonAvatar name={p.socialName || p.fullName} size="sm" />
                          <div className="flex min-w-0 flex-col">
                            <Link
                              href={`/pacientes/${p.id}`}
                              className="truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {p.socialName || p.fullName}
                            </Link>
                            <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-col">
                          <span>{formatBirthDate(p.birthDate)}</span>
                          <span className="text-xs text-muted-foreground">{formatAge(p.birthDate)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {pro ? (
                          <span className="flex items-center gap-2">
                            <ProDot colorIndex={pro.colorIndex} />
                            {pro.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{p.phone || p.email || "—"}</TableCell>
                      <TableCell className="pr-5 text-right">
                        <PatientStatusPill status={p.status} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <ListFooter>
              {data.length} {data.length === 1 ? "paciente" : "pacientes"}
            </ListFooter>
          </div>
        )}
      </SectionCard>
    </>
  )
}
