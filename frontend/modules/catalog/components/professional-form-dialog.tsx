"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { professionalSchema, type ProfessionalInput } from "@/domain/schemas"
import type { Professional } from "@/domain/types"
import { maskPhone } from "@/shared/lib/format"
import { useLookups } from "@/shared/lib/lookups"
import { FormDialog } from "@/shared/ui/molecules/form-dialog"
import { FormField, SwitchField } from "@/shared/ui/molecules/form-field"

import { useSaveProfessional } from "../queries"

export function ProfessionalFormDialog({
  professional,
  onClose,
}: {
  professional?: Professional
  onClose: (saved?: Professional) => void
}) {
  const { specialties } = useLookups()
  const save = useSaveProfessional(professional?.id)
  const form = useForm<ProfessionalInput>({
    resolver: zodResolver(professionalSchema) as never,
    defaultValues: {
      name: professional?.name ?? "",
      email: professional?.email ?? "",
      phone: professional?.phone ?? "",
      registry: professional?.registry ?? "",
      specialtyIds: professional?.specialtyIds ?? [],
      active: professional?.active ?? true,
    },
  })
  const { errors } = form.formState

  const submit = form.handleSubmit((values) => save.mutate(values, { onSuccess: (saved) => onClose(saved) }))

  return (
    <FormDialog
      size="md"
      title={professional ? "Editar profissional" : "Novo profissional"}
      description="Especialidade descreve a atuação; o acesso ao sistema é definido pelo papel do usuário."
      formId="professional-form"
      submitLabel="Salvar"
      pending={save.isPending}
      isDirty={form.formState.isDirty}
      onClose={() => onClose()}
    >
      <form id="professional-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField id="pro-name" label="Nome completo" required error={errors.name?.message}>
          <Input id="pro-name" {...form.register("name")} aria-invalid={!!errors.name} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pro-email" label="E-mail" required error={errors.email?.message}>
            <Input id="pro-email" type="email" {...form.register("email")} aria-invalid={!!errors.email} />
          </FormField>
          <FormField id="pro-phone" label="Telefone" error={errors.phone?.message}>
            <Controller
              control={form.control}
              name="phone"
              render={({ field }) => (
                <Input id="pro-phone" inputMode="tel" value={field.value ?? ""} onChange={(e) => field.onChange(maskPhone(e.target.value))} />
              )}
            />
          </FormField>
        </div>
        <FormField id="pro-registry" label="Registro profissional" hint="Ex.: CRP 06/123456" error={errors.registry?.message}>
          <Input id="pro-registry" {...form.register("registry")} />
        </FormField>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">
            Especialidades <span className="text-destructive" aria-hidden>*</span>
          </legend>
          <Controller
            control={form.control}
            name="specialtyIds"
            render={({ field }) => (
              <div className="grid gap-2 sm:grid-cols-2">
                {specialties.map((s) => {
                  const checked = field.value.includes(s.id)
                  return (
                    <label key={s.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm has-[[data-checked]]:border-primary/50 has-[[data-checked]]:bg-primary/5">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.onChange(next ? [...field.value, s.id] : field.value.filter((x) => x !== s.id))
                        }
                      />
                      {s.name}
                    </label>
                  )
                })}
              </div>
            )}
          />
          {errors.specialtyIds && (
            <p role="alert" className="text-xs text-destructive">
              {errors.specialtyIds.message}
            </p>
          )}
        </fieldset>

        <Controller
          control={form.control}
          name="active"
          render={({ field }) => (
            <SwitchField
              id="pro-active"
              label="Ativo"
              description="Inativar preserva o histórico, mas impede novos agendamentos."
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </form>
    </FormDialog>
  )
}
