"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Pencil, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { serviceSchema, specialtySchema, type ServiceInput, type SpecialtyInput } from "@/domain/schemas"
import type { Service, Specialty } from "@/domain/types"
import { useCan } from "@/shared/lib/current-user"
import { formatCurrency, formatDuration } from "@/shared/lib/format"
import { useLookups } from "@/shared/lib/lookups"
import { ActivePill } from "@/shared/ui/atoms/state-pill"
import { actionsColumn, DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { FormField, SwitchField } from "@/shared/ui/molecules/form-field"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { useSaveService, useSaveSpecialty } from "../queries"

type Editing<T> = { item?: T } | null

const ROOM_OPTIONS = [
  { value: "required", label: "Exige sala" },
  { value: "optional", label: "Sala opcional" },
]
const STATUS_OPTIONS = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
]

export function ServicesView() {
  const { services, specialties, specialty, isLoading } = useLookups()
  const canManage = useCan("services:manage")
  const [editingService, setEditingService] = useState<Editing<Service>>(null)
  const [editingSpecialty, setEditingSpecialty] = useState<Editing<Specialty>>(null)

  const columns = useMemo<DataTableColumn<Service>[]>(
    () => [
      {
        id: "name",
        header: "Serviço",
        accessorFn: (s) => s.name,
        meta: {
          label: "Serviço",
          alwaysVisible: true,
          searchValue: (s) => `${s.name} ${specialty.get(s.specialtyId)?.name ?? ""}`,
          filter: { kind: "multiselect", label: "Especialidade", options: specialties.map((sp) => ({ value: sp.id, label: sp.name })), value: (s) => s.specialtyId },
        },
        cell: ({ row: { original: s } }) => (
          <div className="flex flex-col">
            <span className="font-medium">{s.name}</span>
            <span className="text-xs text-muted-foreground">{specialty.get(s.specialtyId)?.name}</span>
          </div>
        ),
      },
      {
        id: "duration",
        header: "Duração",
        accessorFn: (s) => s.durationMin,
        meta: { label: "Duração", className: "tabular-nums", filter: { kind: "range", label: "Duração", unit: "min", value: (s) => s.durationMin } },
        cell: ({ row: { original: s } }) => formatDuration(s.durationMin),
      },
      {
        id: "price",
        header: "Valor de referência",
        accessorFn: (s) => s.referencePriceCents,
        meta: { label: "Valor de referência", hideBelow: "md", className: "tabular-nums", filter: { kind: "money", label: "Valor", value: (s) => s.referencePriceCents } },
        cell: ({ row: { original: s } }) => formatCurrency(s.referencePriceCents),
      },
      {
        id: "room",
        header: "Sala",
        accessorFn: (s) => (s.requiresRoom ? "Exige" : "Opcional"),
        meta: {
          label: "Sala",
          hideBelow: "sm",
          className: "text-muted-foreground",
          filter: { kind: "select", label: "Sala", allLabel: "Sala: qualquer", options: ROOM_OPTIONS, value: (s) => (s.requiresRoom ? "required" : "optional") },
        },
        cell: ({ row: { original: s } }) => (s.requiresRoom ? "Exige" : "Opcional"),
      },
      {
        id: "status",
        header: "Situação",
        accessorFn: (s) => (s.active ? "Ativo" : "Inativo"),
        meta: { label: "Situação", filter: { kind: "status", label: "Situação", options: STATUS_OPTIONS, value: (s) => (s.active ? "active" : "inactive") } },
        cell: ({ row: { original: s } }) => <ActivePill active={s.active} />,
      },
      ...(canManage
        ? [
            actionsColumn<Service>((s) => (
              <Button variant="ghost" size="icon-sm" aria-label={`Editar ${s.name}`} onClick={() => setEditingService({ item: s })}>
                <Pencil aria-hidden />
              </Button>
            )),
          ]
        : []),
    ],
    [specialty, specialties, canManage]
  )

  return (
    <>
      <PageHeader
        eyebrow="Clínica"
        title="Serviços e especialidades"
        description="Catálogo usado na agenda. Itens são desativados, nunca excluídos, para preservar o histórico."
        actions={
          canManage && (
            <Button onClick={() => setEditingService({})}>
              <Plus data-icon="inline-start" aria-hidden />
              Novo serviço
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <SectionCard title="Serviços" description={`${services.filter((s) => s.active).length} ativos`} bodyClassName="p-0">
          <DataTable
            label="Serviços"
            tableKey="services"
            columns={columns}
            data={services}
            getRowId={(s) => s.id}
            defaultState={{ sort: [{ id: "name", desc: false }] }}
            searchPlaceholder="Serviço ou especialidade"
            isLoading={isLoading}
            noun={["serviço", "serviços"]}
            empty={{ title: "Nenhum serviço cadastrado" }}
          />
        </SectionCard>

        <SectionCard
          title="Especialidades"
          description="Independem do papel de acesso."
          actions={
            canManage && (
              <Button size="sm" variant="outline" onClick={() => setEditingSpecialty({})}>
                <Plus data-icon="inline-start" aria-hidden />
                Nova
              </Button>
            )
          }
          bodyClassName="p-2"
        >
          <ul className="flex flex-col">
            {specialties.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/60">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  {s.description && <span className="truncate text-xs text-muted-foreground">{s.description}</span>}
                </div>
                {!s.active && <ActivePill active={false} />}
                {canManage && (
                  <Button variant="ghost" size="icon-xs" aria-label={`Editar ${s.name}`} onClick={() => setEditingSpecialty({ item: s })}>
                    <Pencil aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {editingService && (
        <ServiceDialog service={editingService.item} specialties={specialties} onClose={() => setEditingService(null)} />
      )}
      {editingSpecialty && <SpecialtyDialog specialty={editingSpecialty.item} onClose={() => setEditingSpecialty(null)} />}
    </>
  )
}

function ServiceDialog({ service, specialties, onClose }: { service?: Service; specialties: Specialty[]; onClose: () => void }) {
  const save = useSaveService()
  const form = useForm<ServiceInput>({
    resolver: zodResolver(serviceSchema) as never,
    defaultValues: {
      name: service?.name ?? "",
      specialtyId: service?.specialtyId ?? "",
      durationMin: service?.durationMin ?? 50,
      referencePrice: service ? service.referencePriceCents / 100 : 0,
      requiresRoom: service?.requiresRoom ?? true,
      active: service?.active ?? true,
    },
  })
  const { errors } = form.formState

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>A duração padrão define o término ao agendar.</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form
            id="service-form"
            noValidate
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((input) => save.mutate({ input, id: service?.id }, { onSuccess: onClose }))}
          >
            <FormField id="svc-name" label="Nome" required error={errors.name?.message}>
              <Input id="svc-name" {...form.register("name")} />
            </FormField>
            <FormField id="svc-specialty" label="Especialidade" required error={errors.specialtyId?.message}>
              <Controller
                control={form.control}
                name="specialtyId"
                render={({ field }) => (
                  <SimpleSelect
                    id="svc-specialty"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.specialtyId}
                    options={specialties.filter((s) => s.active || s.id === field.value).map((s) => ({ value: s.id, label: s.name }))}
                  />
                )}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField id="svc-duration" label="Duração (min)" required error={errors.durationMin?.message}>
                <Input id="svc-duration" type="number" min={10} step={5} {...form.register("durationMin", { valueAsNumber: true })} />
              </FormField>
              <FormField id="svc-price" label="Valor (R$)" error={errors.referencePrice?.message}>
                <Input id="svc-price" type="number" min={0} step={0.01} {...form.register("referencePrice", { valueAsNumber: true })} />
              </FormField>
            </div>
            <Controller
              control={form.control}
              name="requiresRoom"
              render={({ field }) => (
                <SwitchField id="svc-room" label="Exige sala" description="O agendamento só é salvo com sala definida." checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => <SwitchField id="svc-active" label="Ativo" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </form>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="service-form" disabled={save.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SpecialtyDialog({ specialty, onClose }: { specialty?: Specialty; onClose: () => void }) {
  const save = useSaveSpecialty()
  const form = useForm<SpecialtyInput>({
    resolver: zodResolver(specialtySchema) as never,
    defaultValues: { name: specialty?.name ?? "", description: specialty?.description ?? "", active: specialty?.active ?? true },
  })
  const { errors } = form.formState

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{specialty ? "Editar especialidade" : "Nova especialidade"}</DialogTitle>
          <DialogDescription>Ex.: Psicologia, Fonoaudiologia, Terapia ocupacional.</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form
            id="specialty-form"
            noValidate
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((input) => save.mutate({ input, id: specialty?.id }, { onSuccess: onClose }))}
          >
            <FormField id="spc-name" label="Nome" required error={errors.name?.message}>
              <Input id="spc-name" {...form.register("name")} />
            </FormField>
            <FormField id="spc-desc" label="Descrição">
              <Input id="spc-desc" {...form.register("description")} />
            </FormField>
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => <SwitchField id="spc-active" label="Ativa" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </form>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="specialty-form" disabled={save.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
