"use client"

import { ShieldCheck } from "lucide-react"

import { BrandMark } from "@/shared/ui/atoms/brand-mark"

import { SignInForm } from "./sign-in-form"

export function SignInScreen() {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex">
        <div className="pointer-events-none relative flex flex-1 flex-col justify-between px-(--page-gutter) py-(--page-pad-y)">
          <BrandMark className="text-primary-foreground" subtitleClassName="text-primary-foreground/90" />
          <div className="flex max-w-md flex-col gap-5">
            <h1 className="font-serif text-5xl leading-[1.05] text-balance">
              Cuidado contínuo começa com uma agenda em ordem.
            </h1>
            <p className="leading-relaxed text-pretty">
              Pacientes, responsáveis, profissionais e salas no mesmo lugar — com conflitos detectados antes de virarem
              problema na recepção.
            </p>
          </div>
          <p className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4" aria-hidden />
            Cada perfil vê apenas o que sua função permite.
          </p>
        </div>
      </section>

      <section className="flex flex-col items-center justify-center gap-8 px-(--page-gutter) py-(--page-pad-y)">
        <div className="flex w-full max-w-md flex-col gap-2">
          <div className="mb-4 lg:hidden">
            <BrandMark />
          </div>
          <h1 className="font-serif text-3xl text-balance">Entrar no painel</h1>
          <p className="leading-relaxed text-foreground/80">Use seu e-mail e senha de acesso da clínica.</p>
        </div>
        <SignInForm />
        <a href="/politica-de-privacidade" className="text-sm text-foreground/75 underline-offset-4 hover:underline">
          Política de Privacidade
        </a>
      </section>
    </main>
  )
}
