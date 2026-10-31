"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { DoorOpen, Pencil, Plus, Users } from "lucide-react"
import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { roomSchema, type RoomInput } from "@/domain/schemas"
import type { Room } from "@/domain/types"
import { useCan } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { ActivePill, StatePill } from "@/shared/ui/atoms/state-pill"
import { actionsColumn, DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { FormField, SwitchField } from "@/shared/ui/molecules/form-field"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { useSaveRoom } from "../queries"

const EXCLUSIVE_OPTIONS = [
  { value: "exclusive", label: "Exclusivas" },
  { value: "shared", label: "Compartilhadas" },
]
const STATUS_OPTIONS = [
  { value: "active", label: "Ativas" },
  { value: "inactive", label: "Inativas" },
]

export function RoomsView() {
  const { rooms, isLoading } = useLookups()
  const canManage = useCan("rooms:manage")
  const [editing, setEditing] = useState<{ item?: Room } | null>(null)

  const columns = useMemo<DataTableColumn<Room>[]>(
    () => [
      {
        id: "name",
        header: "Sala",
        accessorFn: (r) => r.name,
        meta: { label: "Sala", alwaysVisible: true, searchValue: (r) => `${r.name} ${r.notes ?? ""}` },
        cell: ({ row: { original: r } }) => (
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DoorOpen className="size-4" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">{r.name}</span>
              {r.notes && <span className="line-clamp-1 text-xs text-muted-foreground">{r.notes}</span>}
            </div>
          </div>
        ),
      },
      {
        id: "capacity",
        header: "Capacidade",
        accessorFn: (r) => r.capacity,
        meta: { label: "Capacidade", hideBelow: "sm", filter: { kind: "range", label: "Capacidade", unit: "pessoas", value: (r) => r.capacity } },
        cell: ({ row: { original: r } }) => (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Users className="size-3.5" aria-hidden />
            {r.capacity} {r.capacity === 1 ? "pessoa" : "pessoas"}
          </span>
        ),
      },
      {
        id: "exclusive",
        header: "Uso",
        accessorFn: (r) => (r.exclusive ? "Exclusiva" : "Compartilhada"),
        meta: {
          label: "Uso",
          hideBelow: "sm",
          filter: { kind: "select", label: "Uso", allLabel: "Uso: qualquer", options: EXCLUSIVE_OPTIONS, value: (r) => (r.exclusive ? "exclusive" : "shared") },
        },
        cell: ({ row: { original: r } }) => (r.exclusive ? <StatePill tone="warning">Exclusiva</StatePill> : <span className="text-muted-foreground">Compartilhada</span>),
      },
      {
        id: "status",
        header: "Situação",
        accessorFn: (r) => (r.active ? "Ativa" : "Inativa"),
        meta: { label: "Situação", filter: { kind: "status", label: "Situação", options: STATUS_OPTIONS, value: (r) => (r.active ? "active" : "inactive") } },
        cell: ({ row: { original: r } }) => <ActivePill active={r.active} />,
      },
      ...(canManage
        ? [
            actionsColumn<Room>((r) => (
              <Button variant="ghost" size="icon-sm" aria-label={`Editar ${r.name}`} onClick={() => setEditing({ item: r })}>
                <Pencil aria-hidden />
              </Button>
            )),
          ]
        : []),
    ],
    [canManage]
  )

  return (
    <>
      <PageHeader
        eyebrow="Clínica"
        title="Salas e recursos"
        description="Salas exclusivas entram na checagem de conflito: só um atendimento por vez."
        actions={
          canManage && (
            <Button onClick={() => setEditing({})}>
              <Plus data-icon="inline-start" aria-hidden />
              Nova sala
            </Button>
          )
        }
      />

      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Salas"
          tableKey="rooms"
          columns={columns}
          data={rooms}
          getRowId={(r) => r.id}
          defaultState={{ sort: [{ id: "name", desc: false }] }}
          searchPlaceholder="Nome ou observação"
          isLoading={isLoading}
          noun={["sala", "salas"]}
          empty={{ icon: <DoorOpen aria-hidden />, title: "Nenhuma sala cadastrada" }}
        />
      </SectionCard>

      {editing && <RoomDialog room={editing.item} onClose={() => setEditing(null)} />}
    </>
  )
}

function RoomDialog({ room, onClose }: { room?: Room; onClose: () => void }) {
  const save = useSaveRoom()
  const form = useForm<RoomInput>({
    resolver: zodResolver(roomSchema) as never,
    defaultValues: {
      name: room?.name ?? "",
      capacity: room?.capacity ?? 3,
      exclusive: room?.exclusive ?? true,
      active: room?.active ?? true,
      notes: room?.notes ?? "",
    },
  })
  const { errors } = form.formState

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{room ? "Editar sala" : "Nova sala"}</DialogTitle>
          <DialogDescription>Salas inativas deixam de aparecer na agenda.</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form
            id="room-form"
            noValidate
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((input) => save.mutate({ input, id: room?.id }, { onSuccess: onClose }))}
          >
            <div className="grid grid-cols-[1fr_110px] gap-4">
              <FormField id="room-name" label="Nome" required error={errors.name?.message}>
                <Input id="room-name" {...form.register("name")} />
              </FormField>
              <FormField id="room-cap" label="Capacidade" error={errors.capacity?.message}>
                <Input id="room-cap" type="number" min={1} {...form.register("capacity", { valueAsNumber: true })} />
              </FormField>
            </div>
            <FormField id="room-notes" label="Observações" hint="Ex.: tatame, espelho, material sensorial.">
              <Textarea id="room-notes" rows={2} {...form.register("notes")} />
            </FormField>
            <Controller
              control={form.control}
              name="exclusive"
              render={({ field }) => (
                <SwitchField id="room-excl" label="Uso exclusivo" description="Impede dois atendimentos simultâneos." checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => <SwitchField id="room-active" label="Ativa" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </form>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="room-form" disabled={save.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
