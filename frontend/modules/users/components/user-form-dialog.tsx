"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ROLE_LABELS } from "@/domain/permissions"
import { userCreateSchema, userUpdateSchema, type UserCreateInput } from "@/domain/schemas"
import type { Role, RoleView, UserAccount } from "@/domain/types"
import { useLookups } from "@/shared/lib/lookups"
import { FormDialog } from "@/shared/ui/molecules/form-dialog"
import { FormField, SwitchField } from "@/shared/ui/molecules/form-field"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { useSaveUser } from "../queries"

const NO_PROFESSIONAL = "__none__"

type FormValues = UserCreateInput

/** Papéis de sistema que a API devolve; antes de carregar (ou sem acesso) cai nos rótulos padrão. */
function roleOptions(roles: RoleView[] | undefined) {
  if (roles?.length) return roles.map((r) => ({ key: r.key, label: r.label, description: r.description }))
  return (Object.keys(ROLE_LABELS) as Role[]).map((key) => ({ key, label: ROLE_LABELS[key], description: "" }))
}

export function UserFormDialog({
  user,
  roles,
  onClose,
}: {
  user?: UserAccount
  roles?: RoleView[]
  onClose: (saved?: UserAccount) => void
}) {
  const { professionals } = useLookups()
  const save = useSaveUser(user?.id)
  const form = useForm<FormValues>({
    resolver: zodResolver(user ? userUpdateSchema : userCreateSchema) as never,
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      roles: user?.roles ?? [],
      professionalId: user?.professionalId ?? "",
      active: user?.active ?? true,
    },
  })
  const { errors } = form.formState
  const selectedRoles = form.watch("roles")
  const professionalId = form.watch("professionalId")
  const needsProfessional = selectedRoles.includes("professional") && !professionalId

  const submit = form.handleSubmit((values) => {
    const { password, ...rest } = values
    save.mutate(user ? rest : { ...rest, password }, { onSuccess: (saved) => onClose(saved) })
  })

  return (
    <FormDialog
      size="md"
      title={user ? "Editar usuário" : "Novo usuário"}
      description="O acesso vem dos papéis: as permissões de cada papel ficam na aba “Papéis e permissões”."
      formId="user-form"
      submitLabel="Salvar"
      pending={save.isPending}
      isDirty={form.formState.isDirty}
      onClose={() => onClose()}
    >
      <form id="user-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField id="user-name" label="Nome completo" required error={errors.name?.message}>
          <Input id="user-name" autoComplete="off" {...form.register("name")} aria-invalid={!!errors.name} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="user-email" label="E-mail de acesso" required error={errors.email?.message}>
            <Input id="user-email" type="email" autoComplete="off" {...form.register("email")} aria-invalid={!!errors.email} />
          </FormField>
          {!user && (
            <FormField id="user-password" label="Senha inicial" required hint="Mínimo de 8 caracteres." error={errors.password?.message}>
              <Input
                id="user-password"
                type="password"
                autoComplete="new-password"
                {...form.register("password")}
                aria-invalid={!!errors.password}
              />
            </FormField>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">
            Papéis <span className="text-destructive" aria-hidden>*</span>
          </legend>
          <Controller
            control={form.control}
            name="roles"
            render={({ field }) => (
              <div className="grid gap-2 sm:grid-cols-2">
                {roleOptions(roles).map((role) => {
                  const checked = field.value.includes(role.key)
                  return (
                    <label
                      key={role.key}
                      className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm has-[[data-checked]]:border-primary/50 has-[[data-checked]]:bg-primary/5"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.onChange(next ? [...field.value, role.key] : field.value.filter((x) => x !== role.key))
                        }
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium">{role.label}</span>
                        {role.description && <span className="text-xs leading-relaxed text-muted-foreground">{role.description}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          />
          {errors.roles && (
            <p role="alert" className="text-xs text-destructive">
              {errors.roles.message}
            </p>
          )}
        </fieldset>

        <FormField
          id="user-professional"
          label="Profissional vinculado"
          hint={
            needsProfessional
              ? "Quem tem o papel Profissional precisa de um cadastro vinculado para ver a própria agenda e os pacientes que atende."
              : "Opcional. Liga o acesso ao cadastro de profissional (agenda e pacientes próprios)."
          }
        >
          <Controller
            control={form.control}
            name="professionalId"
            render={({ field }) => (
              <SimpleSelect
                id="user-professional"
                value={field.value || NO_PROFESSIONAL}
                onChange={(value) => field.onChange(value === NO_PROFESSIONAL ? "" : value)}
                options={[
                  { value: NO_PROFESSIONAL, label: "Sem vínculo" },
                  ...professionals.map((p) => ({ value: p.id, label: p.active ? p.name : `${p.name} (inativo)` })),
                ]}
              />
            )}
          />
        </FormField>

        <Controller
          control={form.control}
          name="active"
          render={({ field }) => (
            <SwitchField
              id="user-active"
              label="Acesso ativo"
              description="Desativar encerra as sessões e impede novos acessos; o histórico fica preservado."
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </form>
    </FormDialog>
  )
}
