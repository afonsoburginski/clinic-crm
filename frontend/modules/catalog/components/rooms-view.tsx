"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { DoorOpen, Pencil, Plus, Users } from "lucide-react"
import { useState } from "react"
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
import { EmptyState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { FormField, SwitchField } from "@/shared/ui/molecules/form-field"
import { PageHeader } from "@/shared/ui/molecules/page-header"

import { useSaveRoom } from "../queries"

export function RoomsView() {
  const { rooms, isLoading } = useLookups()
  const canManage = useCan("rooms:manage")
  const [editing, setEditing] = useState<{ item?: Room } | null>(null)

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

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : rooms.length === 0 ? (
        <EmptyState title="Nenhuma sala cadastrada" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {rooms.map((r) => (
            <li key={r.id} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <DoorOpen className="size-5" aria-hidden />
                </span>
                {canManage && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Editar ${r.name}`} onClick={() => setEditing({ item: r })}>
                    <Pencil aria-hidden />
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="font-medium">{r.name}</h2>
                {r.notes && <p className="text-sm leading-relaxed text-muted-foreground">{r.notes}</p>}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3.5" aria-hidden />
                  {r.capacity} {r.capacity === 1 ? "pessoa" : "pessoas"}
                </span>
                {r.exclusive && <StatePill tone="warning">Exclusiva</StatePill>}
                <ActivePill active={r.active} />
              </div>
            </li>
          ))}
        </ul>
      )}

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
