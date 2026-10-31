"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { passwordResetSchema, type PasswordResetInput } from "@/domain/schemas"
import type { UserAccount } from "@/domain/types"
import { FormDialog } from "@/shared/ui/molecules/form-dialog"
import { FormField } from "@/shared/ui/molecules/form-field"

import { useResetPassword } from "../queries"

export function PasswordResetDialog({ user, onClose }: { user: UserAccount; onClose: () => void }) {
  const reset = useResetPassword(user.id)
  const form = useForm<PasswordResetInput>({
    resolver: zodResolver(passwordResetSchema) as never,
    defaultValues: { password: "", confirm: "" },
  })
  const { errors } = form.formState

  return (
    <FormDialog
      size="sm"
      title="Redefinir senha"
      description={`Define uma nova senha para ${user.name}. As sessões abertas dele são encerradas e ele entra de novo com a senha nova.`}
      formId="password-form"
      submitLabel="Redefinir senha"
      pending={reset.isPending}
      isDirty={form.formState.isDirty}
      onClose={onClose}
    >
      <form id="password-form" noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => reset.mutate(values, { onSuccess: onClose }))}>
        <FormField id="reset-password" label="Nova senha" required hint="Mínimo de 8 caracteres." error={errors.password?.message}>
          <Input id="reset-password" type="password" autoComplete="new-password" {...form.register("password")} aria-invalid={!!errors.password} />
        </FormField>
        <FormField id="reset-confirm" label="Confirmar a nova senha" required error={errors.confirm?.message}>
          <Input id="reset-confirm" type="password" autoComplete="new-password" {...form.register("confirm")} aria-invalid={!!errors.confirm} />
        </FormField>
      </form>
    </FormDialog>
  )
}
