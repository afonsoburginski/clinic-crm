"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { assessmentFormSchema, stagesFromText, type AssessmentFormInput } from "@/domain/schemas"
import { useCurrentUser } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { FormField } from "@/shared/ui/molecules/form-field"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { useCreateAssessment } from "../queries"

export function AssessmentFormDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useCurrentUser()
  const { patients, professionals } = useLookups()
  const create = useCreateAssessment()
  const form = useForm<AssessmentFormInput>({
    resolver: zodResolver(assessmentFormSchema),
    defaultValues: {
      patientId: "",
      title: "",
      purpose: "",
      responsibleProfessionalId: user?.professionalId ?? "",
      stagesText: "",
    },
  })
  const errors = form.formState.errors

  const submit = form.handleSubmit(({ stagesText, ...rest }) =>
    create.mutate({ ...rest, stages: stagesFromText(stagesText) }, { onSuccess: (a) => onCreated(a.id) })
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Nova avaliação</DialogTitle>
          <DialogDescription>
            Informe o responsável, a finalidade e as etapas. Concluir exige todas as etapas feitas e uma interpretação clínica.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="assessment-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
            <FormField id="assessment-patient" label="Paciente" required error={errors.patientId?.message}>
              <Controller
                control={form.control}
                name="patientId"
                render={({ field }) => (
                  <SimpleSelect
                    id="assessment-patient"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.patientId}
                    options={patients.map((p) => ({ value: p.id, label: `${p.socialName || p.fullName} · ${p.code}` }))}
                    placeholder={patients.length ? "Selecione" : "Nenhum paciente disponível"}
                  />
                )}
              />
            </FormField>

            <FormField id="assessment-title" label="Título" required error={errors.title?.message}>
              <Input id="assessment-title" aria-invalid={!!errors.title || undefined} {...form.register("title")} />
            </FormField>

            <FormField id="assessment-purpose" label="Finalidade" required error={errors.purpose?.message}>
              <Textarea id="assessment-purpose" rows={3} aria-invalid={!!errors.purpose || undefined} {...form.register("purpose")} />
            </FormField>

            <FormField id="assessment-responsible" label="Profissional responsável" required error={errors.responsibleProfessionalId?.message} hint="Só o responsável conclui ou cancela a avaliação.">
              <Controller
                control={form.control}
                name="responsibleProfessionalId"
                render={({ field }) => (
                  <SimpleSelect
                    id="assessment-responsible"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.responsibleProfessionalId}
                    options={professionals.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))}
                  />
                )}
              />
            </FormField>

            <FormField id="assessment-stages" label="Etapas" required error={errors.stagesText?.message} hint="Uma etapa por linha, na ordem em que acontecem.">
              <Textarea
                id="assessment-stages"
                rows={5}
                placeholder={"Entrevista inicial\nAplicação de instrumentos\nDevolutiva"}
                aria-invalid={!!errors.stagesText || undefined}
                {...form.register("stagesText")}
              />
            </FormField>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="assessment-form" disabled={create.isPending}>
            {create.isPending ? "Salvando…" : "Abrir avaliação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
