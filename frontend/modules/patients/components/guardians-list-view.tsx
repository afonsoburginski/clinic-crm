"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { HeartHandshake } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { guardianSchema, type GuardianInput } from "@/domain/schemas"
import type { Guardian } from "@/domain/types"
import type { GuardianWithPatients } from "@/shared/api/api"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { guardianActions } from "../lib/guardian-actions"
import { useGuardians, useSaveGuardian } from "../queries"
import { GuardianFields } from "./guardian-fields"

const LINK_OPTIONS = [
  { value: "linked", label: "Com pacientes" },
  { value: "unlinked", label: "Sem pacientes" },
]

export function GuardiansListView() {
  const { data, isLoading, error, refetch, isPlaceholderData } = useGuardians("")
  const [editing, setEditing] = useState<Guardian | null>(null)

  const columns = useMemo<DataTableColumn<GuardianWithPatients>[]>(
    () => [
      {
        id: "guardian",
        header: "Responsável",
        accessorFn: ({ guardian }) => guardian.fullName,
        meta: {
          label: "Responsável",
          alwaysVisible: true,
          searchValue: ({ guardian }) => [guardian.fullName, guardian.phone, guardian.email, guardian.document, guardian.document?.replace(/\D/g, "")].filter(Boolean).join(" "),
        },
        cell: ({ row: { original: { guardian } } }) => (
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
        ),
      },
      {
        id: "patients",
        header: "Pacientes vinculados",
        accessorFn: ({ patients }) => patients.length,
        meta: {
          label: "Pacientes vinculados",
          searchValue: ({ patients }) => patients.map(({ patient }) => `${patient.fullName} ${patient.socialName ?? ""}`).join(" "),
          filter: { kind: "select", label: "Vínculo", allLabel: "Todos os responsáveis", options: LINK_OPTIONS, value: ({ patients }) => (patients.length ? "linked" : "unlinked") },
        },
        cell: ({ row: { original: { patients } } }) => (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
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
          </div>
        ),
      },
    ],
    []
  )

  return (
    <>
      <PageHeader
        title="Responsáveis"
        description="Pais, tutores e cuidadores. Novos vínculos são criados a partir da ficha do paciente."
      />
      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Responsáveis"
          tableKey="guardians"
          columns={columns}
          data={data ?? []}
          getRowId={({ guardian }) => guardian.id}
          defaultState={{ sort: [{ id: "guardian", desc: false }] }}
          searchPlaceholder="Nome, telefone ou CPF"
          isLoading={isLoading}
          isRefreshing={isPlaceholderData}
          error={error}
          onRetry={() => refetch()}
          noun={["responsável", "responsáveis"]}
          rowLabel={({ guardian }) => guardian.fullName}
          rowActions={({ guardian }) => guardianActions(guardian, { onEdit: () => setEditing(guardian) })}
          empty={{ icon: <HeartHandshake aria-hidden />, title: "Nenhum responsável cadastrado" }}
        />
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
