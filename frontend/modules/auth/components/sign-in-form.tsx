"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff, Lock, Mail } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { HaloButton } from "@/components/ui/halo-button"
import { DEMO_PASSWORD, loginSchema, type LoginInput } from "@/domain/schemas"
import { api } from "@/shared/api/demo-api"
import { useSessionStore } from "@/shared/lib/session-store"
import { Input } from "@/shared/ui/atoms/text-input"
import { FormField } from "@/shared/ui/molecules/form-field"

const DEMO_ACCOUNTS = [
  { email: "marina@clinicaflor.demo", label: "Administração" },
  { email: "juliana@clinicaflor.demo", label: "Recepção" },
  { email: "helena@clinicaflor.demo", label: "Profissional" },
]

export function SignInForm() {
  const router = useRouter()
  const client = useQueryClient()
  const signIn = useSessionStore((s) => s.signIn)
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: LoginInput) {
    setFormError(null)
    try {
      const user = await api.auth.signIn(values)
      client.clear()
      signIn(user.id)
      router.replace("/painel")
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível entrar.")
    }
  }

  function fillDemo(email: string) {
    setValue("email", email, { shouldValidate: true })
    setValue("password", DEMO_PASSWORD, { shouldValidate: true })
    setFormError(null)
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

      <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/40 p-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Contas de demonstração (senha <span className="font-mono text-foreground">{DEMO_PASSWORD}</span>):
        </p>
        <div className="flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => fillDemo(acc.email)}
              className="rounded-full border bg-card px-3 py-1 text-sm transition-colors hover:border-primary/50 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {acc.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
