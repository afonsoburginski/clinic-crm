"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { HeartHandshake } from "lucide-react"
import Link from "next/link"
import { useDeferredValue, useState } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { guardianSchema, type GuardianInput } from "@/domain/schemas"
import type { Guardian } from "@/domain/types"
import { useCan } from "@/shared/lib/current-user"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SearchInput } from "@/shared/ui/molecules/search-input"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { Toolbar, ToolbarGroup } from "@/shared/ui/molecules/toolbar"

import { useGuardians, useSaveGuardian } from "../queries"
import { GuardianFields } from "./guardian-fields"

export function GuardiansListView() {
  const canWrite = useCan("guardians:write")
  const [search, setSearch] = useState("")
  const deferred = useDeferredValue(search)
  const { data, isLoading, error, refetch } = useGuardians(deferred)
  const [editing, setEditing] = useState<Guardian | null>(null)

  return (
    <>
      <PageHeader
        title="Responsáveis"
        description="Pais, tutores e cuidadores. Novos vínculos são criados a partir da ficha do paciente."
      />
      <SectionCard bodyClassName="p-0">
        <Toolbar label="Busca de responsáveis">
          <ToolbarGroup className="w-full sm:max-w-xs">
            <SearchInput value={search} onChange={setSearch} placeholder="Nome, telefone ou CPF" label="Buscar responsáveis" />
          </ToolbarGroup>
        </Toolbar>
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} className="m-4" />
        ) : isLoading ? (
          <ListSkeleton rows={6} className="p-4" />
        ) : !data?.length ? (
          <EmptyState icon={<HeartHandshake aria-hidden />} title="Nenhum responsável encontrado" className="m-4" />
        ) : (
          <ul className="divide-y">
            {data.map(({ guardian, patients }) => (
              <li key={guardian.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <PersonAvatar name={guardian.fullName} size="sm" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{guardian.fullName}</span>
                    <span className="text-xs text-muted-foreground">
                      {guardian.phone}
                      {guardian.email && <> · {guardian.email}</>}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:justify-end">
                  {patients.length ? (
                    patients.map(({ link, patient: p }) => (
                      <Link key={link.id} href={`/pacientes/${p.id}`} className="text-primary hover:underline">
                        {p.socialName || p.fullName}
                        <span className="text-muted-foreground"> ({link.relationship})</span>
                      </Link>
                    ))
                  ) : (
                    <span className="text-muted-foreground">Sem pacientes vinculados</span>
                  )}
                  {canWrite && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(guardian)}>
                      Editar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      {editing && <GuardianEditDialog guardian={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function GuardianEditDialog({ guardian, onClose }: { guardian: Guardian; onClose: () => void }) {
  const save = useSaveGuardian(guardian.id)
  const form = useForm<GuardianInput>({
    resolver: zodResolver(guardianSchema),
    defaultValues: {
      fullName: guardian.fullName,
      document: guardian.document ?? "",
      phone: guardian.phone,
      email: guardian.email ?? "",
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Editar responsável</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <form
            id="guardian-edit-form"
            noValidate
            onSubmit={form.handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
          >
            <GuardianFields form={form} />
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="guardian-edit-form" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
