"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { HeartHandshake } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { useForm } from "react-hook-form"

import { guardianSchema, type GuardianInput } from "@/domain/schemas"
import type { Guardian } from "@/domain/types"
import type { GuardianWithPatients } from "@/shared/api/api"
import { useCan } from "@/shared/lib/current-user"
import { useUrlEditor } from "@/shared/lib/use-url-dialog"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { FormDialog } from "@/shared/ui/molecules/form-dialog"
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
  const canWrite = useCan("guardians:write")
  const guardians = useMemo(() => data?.map(({ guardian }) => guardian), [data])
  const editor = useUrlEditor({ items: guardians, isLoading, allowed: canWrite })

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
          rowActions={({ guardian }) => guardianActions(guardian, { onEdit: () => editor.openEdit(guardian) })}
          empty={{ icon: <HeartHandshake aria-hidden />, title: "Nenhum responsável cadastrado" }}
        />
      </SectionCard>
      {editor.editing && <GuardianEditDialog key={editor.editing.id} guardian={editor.editing} onClose={editor.close} />}
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
    <FormDialog
      size="sm"
      title="Editar responsável"
      formId="guardian-edit-form"
      submitLabel="Salvar"
      pending={save.isPending}
      isDirty={form.formState.isDirty}
      onClose={onClose}
    >
      <form
        id="guardian-edit-form"
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
      >
        <GuardianFields form={form} />
      </form>
    </FormDialog>
  )
}
