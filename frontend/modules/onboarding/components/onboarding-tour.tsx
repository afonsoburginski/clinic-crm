"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChoiceGroup, FeatureCarousel, Onboarding, TipsList, useOnboarding } from "@/components/ui/onboarding"
import { ROLE_LABELS } from "@/domain/permissions"
import type { User } from "@/domain/types"
import { cn } from "@/lib/utils"
import { shouldAutoOpenTour, useOnboardingStore } from "@/shared/lib/onboarding-store"
import { useUiStore } from "@/shared/lib/ui-store"
import { useHydrated } from "@/shared/lib/use-hydrated"

import { featuresFor, tipsFor, type TourFeature } from "../lib/tour-content"

const TOTAL_STEPS = 3

/**
 * Orientação inicial do painel (componente `Onboarding` do registry Cult UI).
 * Abre sozinha só na primeira visita autenticada de cada perfil; dispensar ou concluir fica
 * gravado e nunca mais bloqueia. O menu da conta reabre quando a pessoa quiser rever.
 */
export function OnboardingTour({ user }: { user: User }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const record = useOnboardingStore((s) => s.records[user.id])
  const finish = useOnboardingStore((s) => s.finish)
  const open = useUiStore((s) => s.tourOpen)
  const setOpen = useUiStore((s) => s.setTourOpen)
  const autoChecked = useRef<string | null>(null)

  // Decide uma única vez por perfil, depois da hidratação (o desfecho vem do localStorage).
  useEffect(() => {
    if (!hydrated || autoChecked.current === user.id) return
    autoChecked.current = user.id
    if (shouldAutoOpenTour(record)) setOpen(true)
  }, [hydrated, record, setOpen, user.id])

  function dismiss() {
    finish(user.id, "dismissed")
    setOpen(false)
  }

  function complete(destination?: TourFeature) {
    finish(user.id, "completed")
    setOpen(false)
    if (destination) router.push(destination.href)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent size="xl">
        <TourBody user={user} onComplete={complete} onSkip={dismiss} />
      </DialogContent>
    </Dialog>
  )
}

function TourBody({ user, onComplete, onSkip }: { user: User; onComplete: (destination?: TourFeature) => void; onSkip: () => void }) {
  const features = useMemo(() => featuresFor(user), [user])
  const tips = useMemo(() => tipsFor(user), [user])
  const [startId, setStartId] = useState<string | null>(null)

  return (
    <Onboarding
      totalSteps={TOTAL_STEPS}
      maxStepValue={Math.max(features.length - 1, 0)}
      onComplete={() => onComplete(features.find((feature) => feature.id === startId))}
      className="gap-5 rounded-none border-0 bg-transparent p-0 shadow-none"
    >
      <TourHeader user={user} />

      <Onboarding.Step step={1} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
        <FeatureStep features={features} />
      </Onboarding.Step>

      <Onboarding.Step step={2} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
        <ChoiceGroup
          name="Por onde começar"
          value={startId}
          onValueChange={setStartId}
          className="grid gap-2 sm:grid-cols-2"
        >
          {features.map((feature) => (
            <ChoiceGroup.Item
              key={feature.id}
              value={feature.id}
              className="group flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 data-[state=selected]:border-primary data-[state=selected]:bg-secondary"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-data-[state=selected]:bg-primary group-data-[state=selected]:text-primary-foreground">
                <feature.icon className="size-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{feature.title}</span>
                <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{feature.summary}</span>
              </span>
            </ChoiceGroup.Item>
          ))}
        </ChoiceGroup>
      </Onboarding.Step>

      <Onboarding.Step step={3} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
        <TipsList
          title="Dicas rápidas"
          className="[&_[data-slot=tips-list-items]]:divide-y [&_[data-slot=tips-list-items]]:overflow-hidden [&_[data-slot=tips-list-items]]:rounded-xl [&_[data-slot=tips-list-items]]:border [&_[data-slot=tips-list-items]]:bg-card"
        >
          {tips.map((tip, index) => (
            <TipsList.Item
              key={tip.id}
              number={index + 1}
              className="flex items-start gap-3 px-3.5 py-3 text-sm leading-relaxed [&_[data-slot=tips-list-item-number]]:mt-0.5 [&_[data-slot=tips-list-item-number]]:grid [&_[data-slot=tips-list-item-number]]:size-5 [&_[data-slot=tips-list-item-number]]:shrink-0 [&_[data-slot=tips-list-item-number]]:place-items-center [&_[data-slot=tips-list-item-number]]:rounded-full [&_[data-slot=tips-list-item-number]]:bg-secondary [&_[data-slot=tips-list-item-number]]:text-xs [&_[data-slot=tips-list-item-number]]:font-medium [&_[data-slot=tips-list-item-number]]:text-secondary-foreground"
            >
              <span className="text-pretty">{tip.text}</span>
            </TipsList.Item>
          ))}
        </TipsList>
      </Onboarding.Step>

      <TourFooter hasChoice={startId !== null} onSkip={onSkip} />
    </Onboarding>
  )
}

function TourHeader({ user }: { user: User }) {
  const { currentStep, totalSteps } = useOnboarding()
  const firstName = user.name.split(" ")[0]
  const roles = user.roles.map((role) => ROLE_LABELS[role]).join(" · ")
  const copy = [
    { title: `Olá, ${firstName}`, description: `Perfil: ${roles}. Veja como o trabalho flui por aqui; o que aparece depende do seu perfil.` },
    { title: "Por onde começar?", description: "Escolha uma área para abrir ao concluir. Se preferir, siga sem escolher." },
    { title: "Dicas rápidas", description: "Atalhos que poupam cliques no dia a dia." },
  ][currentStep - 1]

  return (
    <DialogHeader>
      <Onboarding.StepIndicator
        variant="pills"
        aria-label={`Passo ${currentStep} de ${totalSteps}`}
        className="mb-2 justify-start"
        dotClassName="data-[state=active]:bg-primary data-[state=completed]:bg-primary/50 data-[state=inactive]:bg-border"
      />
      <Onboarding.Header className="flex flex-col gap-1 text-left">
        <DialogTitle className="font-serif text-xl">{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </Onboarding.Header>
    </DialogHeader>
  )
}

function FeatureStep({ features }: { features: TourFeature[] }) {
  const { stepValue, setStepValue } = useOnboarding()
  const active = features[stepValue] ?? features[0]
  if (!active) return null

  return (
    <div className="grid gap-4 sm:grid-cols-[13rem_1fr]">
      <FeatureCarousel
        value={stepValue}
        onValueChange={setStepValue}
        aria-label="Áreas do painel"
        aria-orientation="vertical"
        className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible"
      >
        {features.map((feature, index) => (
          <FeatureCarousel.Item
            key={feature.id}
            index={index}
            id={`tour-tab-${feature.id}`}
            aria-controls={`tour-panel-${feature.id}`}
            className={cn(
              "flex h-(--control-h) shrink-0 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none",
              "hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              "data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground"
            )}
          >
            <feature.icon className="size-4 shrink-0" aria-hidden />
            {feature.title}
          </FeatureCarousel.Item>
        ))}
      </FeatureCarousel>

      <div
        role="tabpanel"
        id={`tour-panel-${active.id}`}
        aria-labelledby={`tour-tab-${active.id}`}
        className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4"
      >
        <p className="text-sm leading-relaxed text-pretty text-foreground">{active.summary}</p>
        <ol className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          {active.steps.map((step, index) => (
            <li key={step} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-foreground"
              >
                {index + 1}
              </span>
              <span className="text-pretty">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function TourFooter({ hasChoice, onSkip }: { hasChoice: boolean; onSkip: () => void }) {
  const { currentStep, totalSteps, canGoBack, canGoNext, handleBack, handleNext, handleComplete } = useOnboarding()
  const isLast = currentStep === totalSteps

  return (
    <DialogFooter>
      <Onboarding.Navigation aria-label="Navegação da orientação" className="w-full items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onSkip}>
          Pular orientação
        </Button>
        <span className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled={!canGoBack} onClick={handleBack}>
            Voltar
          </Button>
          {isLast ? (
            <Button type="button" onClick={handleComplete}>
              {hasChoice ? "Concluir e abrir" : "Concluir"}
            </Button>
          ) : (
            <Button type="button" disabled={!canGoNext} onClick={handleNext}>
              Continuar
            </Button>
          )}
        </span>
      </Onboarding.Navigation>
    </DialogFooter>
  )
}
