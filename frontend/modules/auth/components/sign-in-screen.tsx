"use client"

import { ShieldCheck } from "lucide-react"

import BlurText from "@/components/react-bits/blur-text"
import DotGrid from "@/components/react-bits/dot-grid"
import { BrandMark } from "@/shared/ui/atoms/brand-mark"

import { SignInForm } from "./sign-in-form"

export function SignInScreen() {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex">
        <div className="absolute inset-0 opacity-40" aria-hidden>
          <DotGrid
            dotSize={4}
            gap={22}
            baseColor="rgba(255,255,255,0.18)"
            activeColor="rgba(255,255,255,0.9)"
            proximity={110}
          />
        </div>
        <div className="pointer-events-none relative flex flex-1 flex-col justify-between px-(--page-gutter) py-(--page-pad-y)">
          <BrandMark className="text-primary-foreground" />
          <div className="flex max-w-md flex-col gap-5">
            <BlurText
              text="Cuidado contínuo começa com uma agenda em ordem."
              animateBy="words"
              delay={80}
              trigger="load"
              className="font-serif text-5xl leading-[1.05] text-balance"
            />
            <p className="leading-relaxed text-pretty text-primary-foreground/80">
              Pacientes, responsáveis, profissionais e salas no mesmo lugar — com conflitos detectados antes de virarem
              problema na recepção.
            </p>
          </div>
          <p className="flex items-center gap-2 text-sm text-primary-foreground/70">
            <ShieldCheck className="size-4" aria-hidden />
            Cada perfil vê apenas o que sua função permite.
          </p>
        </div>
      </section>

      <section className="flex flex-col items-center justify-center gap-8 px-(--page-gutter) py-(--page-pad-y)">
        <div className="flex w-full max-w-sm flex-col gap-2">
          <div className="mb-4 lg:hidden">
            <BrandMark />
          </div>
          <h1 className="font-serif text-3xl text-balance">Entrar no painel</h1>
          <p className="leading-relaxed text-muted-foreground">Use seu e-mail e senha de acesso da clínica.</p>
        </div>
        <SignInForm />
        <a href="/politica-de-privacidade" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Política de Privacidade
        </a>
      </section>
    </main>
  )
}
