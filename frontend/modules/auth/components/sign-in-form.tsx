"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff, Lock, Mail } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { HaloButton } from "@/components/ui/halo-button"
import { loginSchema, type LoginInput } from "@/domain/schemas"
import { api } from "@/shared/api/api"
import { afterLoginPath } from "@/shared/lib/return-to"
import { Input } from "@/shared/ui/atoms/text-input"
import { FormField } from "@/shared/ui/molecules/form-field"

export function SignInForm() {
  const router = useRouter()
  const client = useQueryClient()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: LoginInput) {
    setFormError(null)
    try {
      await api.auth.signIn(values)
      client.clear()
      router.replace(afterLoginPath(window.location.search))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível entrar.")
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-describedby="login-error">
        <FormField id="email" label="E-mail" error={errors.email?.message} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="voce@clinica.com.br"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            leadingSlot={<Mail className="size-4 text-muted-foreground" aria-hidden />}
            {...register("email")}
          />
        </FormField>

        <FormField id="password" label="Senha" error={errors.password?.message} required>
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Sua senha"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "password-error" : undefined}
            leadingSlot={<Lock className="size-4 text-muted-foreground" aria-hidden />}
            trailingSlot={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            }
            {...register("password")}
          />
        </FormField>

        <p id="login-error" role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
          {formError}
        </p>

        <HaloButton type="submit" isLoading={isSubmitting} loadingText="Entrando…" staggerLabel={false} className="w-full">
          Entrar
        </HaloButton>
      </form>
    </div>
  )
}
