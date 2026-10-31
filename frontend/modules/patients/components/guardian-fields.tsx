"use client"

import { Controller, type UseFormReturn } from "react-hook-form"

import { Input } from "@/components/ui/input"
import type { GuardianInput } from "@/domain/schemas"
import { maskCPF, maskPhone } from "@/shared/lib/format"
import { FormField } from "@/shared/ui/molecules/form-field"

export function GuardianFields({ form }: { form: UseFormReturn<GuardianInput> }) {
  const {
    register,
    control,
    formState: { errors },
  } = form

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="guardian-fullName" label="Nome completo" required error={errors.fullName?.message} className="sm:col-span-2">
        <Input id="guardian-fullName" aria-invalid={!!errors.fullName || undefined} {...register("fullName")} />
      </FormField>
      <FormField id="guardian-phone" label="Telefone" required error={errors.phone?.message}>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <Input
              id="guardian-phone"
              type="tel"
              inputMode="tel"
              aria-invalid={!!errors.phone || undefined}
              value={field.value}
              onBlur={field.onBlur}
              onChange={(e) => field.onChange(maskPhone(e.target.value))}
            />
          )}
        />
      </FormField>
      <FormField id="guardian-document" label="CPF" error={errors.document?.message}>
        <Controller
          control={control}
          name="document"
          render={({ field }) => (
            <Input
              id="guardian-document"
              inputMode="numeric"
              aria-invalid={!!errors.document || undefined}
              value={field.value}
              onBlur={field.onBlur}
              onChange={(e) => field.onChange(maskCPF(e.target.value))}
            />
          )}
        />
      </FormField>
      <FormField id="guardian-email" label="E-mail" error={errors.email?.message} className="sm:col-span-2">
        <Input id="guardian-email" type="email" aria-invalid={!!errors.email || undefined} {...register("email")} />
      </FormField>
    </div>
  )
}
