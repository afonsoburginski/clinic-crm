"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { unavailabilitySchema, type UnavailabilityInput } from "@/domain/schemas"
import type { Professional } from "@/domain/types"
import { formatDateTime } from "@/shared/lib/format"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"
import { FormField } from "@/shared/ui/molecules/form-field"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { useAddUnavailability, useRemoveUnavailability } from "../queries"

export function UnavailabilitySection({ professional, editable }: { professional: Professional; editable: boolean }) {
  const add = useAddUnavailability(professional.id)
  const remove = useRemoveUnavailability(professional.id)
  const [removing, setRemoving] = useState<string | null>(null)
  const form = useForm<UnavailabilityInput>({
    resolver: zodResolver(unavailabilitySchema) as never,
    defaultValues: { date: "", startTime: "08:00", endTime: "18:00", reason: "" },
  })
  const { errors } = form.formState
  const items = [...professional.unavailabilities].sort((a, b) => a.start.localeCompare(b.start))

  return (
    <SectionCard title="Indisponibilidades" description="Férias, afastamentos e compromissos. Bloqueiam novos agendamentos.">
      <div className="flex flex-col gap-5">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma indisponibilidade registrada.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-lg border px-3.5 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{u.reason}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(u.start)} até {formatDateTime(u.end)}
                  </span>
                </div>
                {editable && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remover ${u.reason}`} onClick={() => setRemoving(u.id)}>
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <form
            noValidate
            onSubmit={form.handleSubmit((values) => add.mutate(values, { onSuccess: () => form.reset() }))}
            className="grid gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-[1fr_auto_auto] lg:grid-cols-[1.2fr_auto_auto_1.5fr_auto] lg:items-end"
          >
            <FormField id="un-date" label="Data" required error={errors.date?.message}>
              <Input id="un-date" type="date" {...form.register("date")} />
            </FormField>
            <FormField id="un-start" label="Início" error={errors.startTime?.message}>
              <Input id="un-start" type="time" {...form.register("startTime")} className="w-28" />
            </FormField>
            <FormField id="un-end" label="Término" error={errors.endTime?.message}>
              <Input id="un-end" type="time" {...form.register("endTime")} className="w-28" />
            </FormField>
            <FormField id="un-reason" label="Motivo" required error={errors.reason?.message} className="sm:col-span-2 lg:col-span-1">
              <Input id="un-reason" placeholder="Ex.: Congresso" {...form.register("reason")} />
            </FormField>
            <Button type="submit" disabled={add.isPending}>
              Registrar
            </Button>
          </form>
        )}
      </div>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remover indisponibilidade?"
        description="O horário volta a ficar disponível para agendamentos."
        confirmLabel="Remover"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (!removing) return
          // Otimista: a indisponibilidade sai da lista e o diálogo fecha na hora; em erro a lista volta e o toast avisa.
          remove.mutate(removing)
          setRemoving(null)
        }}
      />
    </SectionCard>
  )
}
