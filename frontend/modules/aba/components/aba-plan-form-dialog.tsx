"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { clinicDateKey } from "@/domain/clinic-time"
import { abaPlanSchema, type AbaPlanInput } from "@/domain/schemas"
import type { AbaPlan } from "@/domain/types"
import { useCurrentUser } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { FormField } from "@/shared/ui/molecules/form-field"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { useCreatePlan, useUpdatePlan } from "../queries"

/** `plan` edita; `template` cria um plano novo já preenchido com título, responsável e datas de outro (duplicar). */
export function AbaPlanFormDialog({ plan, template, onClose, onCreated }: { plan?: AbaPlan; template?: AbaPlan; onClose: () => void; onCreated?: (id: string) => void }) {
  const { user } = useCurrentUser()
  const { patients, professionals } = useLookups()
  const create = useCreatePlan()
  const update = useUpdatePlan(plan?.id ?? "")
  const form = useForm<AbaPlanInput>({
    resolver: zodResolver(abaPlanSchema),
    defaultValues: {
      patientId: (plan ?? template)?.patientId ?? "",
      title: plan ? plan.title : template ? `${template.title} (cópia)` : "",
      startDate: plan?.startDate ?? clinicDateKey(new Date()),
      reviewDate: plan?.reviewDate ?? "",
      responsibleProfessionalId: (plan ?? template)?.responsibleProfessionalId ?? user?.professionalId ?? "",
    },
  })
  const errors = form.formState.errors
  const pending = create.isPending || update.isPending

  const submit = form.handleSubmit((values) => {
    if (plan) update.mutate(values, { onSuccess: onClose })
    else create.mutate(values, { onSuccess: (created) => onCreated?.(created.id) })
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{plan ? "Editar plano" : "Novo plano ABA"}</DialogTitle>
          <DialogDescription>
            O plano nasce em rascunho. Inclua objetivos com critério explícito antes de ativar. Toda alteração fica no histórico.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="aba-plan-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
            <FormField id="aba-patient" label="Paciente" required error={errors.patientId?.message}>
              <Controller
                control={form.control}
                name="patientId"
                render={({ field }) => (
                  <SimpleSelect
                    id="aba-patient"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={!!plan}
                    invalid={!!errors.patientId}
                    options={patients.map((p) => ({ value: p.id, label: `${p.socialName || p.fullName} · ${p.code}` }))}
                    placeholder={patients.length ? "Selecione" : "Nenhum paciente disponível"}
                  />
                )}
              />
            </FormField>
            <FormField id="aba-title" label="Título" required error={errors.title?.message}>
              <Input id="aba-title" aria-invalid={!!errors.title || undefined} {...form.register("title")} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="aba-start" label="Início" required error={errors.startDate?.message}>
                <Input id="aba-start" type="date" aria-invalid={!!errors.startDate || undefined} {...form.register("startDate")} />
              </FormField>
              <FormField id="aba-review" label="Próxima revisão" error={errors.reviewDate?.message}>
                <Input id="aba-review" type="date" aria-invalid={!!errors.reviewDate || undefined} {...form.register("reviewDate")} />
              </FormField>
            </div>
            <FormField id="aba-responsible" label="Profissional responsável" required error={errors.responsibleProfessionalId?.message}>
              <Controller
                control={form.control}
                name="responsibleProfessionalId"
                render={({ field }) => (
                  <SimpleSelect
                    id="aba-responsible"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.responsibleProfessionalId}
                    options={professionals.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))}
                  />
                )}
              />
            </FormField>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="aba-plan-form" disabled={pending}>
            {pending ? "Salvando…" : plan ? "Salvar plano" : "Criar plano"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
