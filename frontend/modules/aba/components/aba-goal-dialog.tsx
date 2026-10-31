"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { abaGoalSchema, type AbaGoalInput } from "@/domain/schemas"
import type { AbaGoal } from "@/domain/types"
import { FormField } from "@/shared/ui/molecules/form-field"

import { useSaveGoal } from "../queries"

/** Todo objetivo exige critério explícito (RN-ABA-002); a meta e as sessões não têm valor padrão. */
export function AbaGoalDialog({ planId, goal, onClose }: { planId: string; goal?: AbaGoal; onClose: () => void }) {
  const save = useSaveGoal(planId)
  const form = useForm<AbaGoalInput>({
    resolver: zodResolver(abaGoalSchema),
    defaultValues: {
      title: goal?.title ?? "",
      description: goal?.description ?? "",
      criterionText: goal?.criterionText ?? "",
      targetPercent: goal?.targetPercent,
      consecutiveSessions: goal?.consecutiveSessions,
    },
  })
  const errors = form.formState.errors

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{goal ? "Editar objetivo" : "Novo objetivo"}</DialogTitle>
          <DialogDescription>
            O critério define quando o objetivo conta como alcançado, usando só as medidas registradas nas sessões.
          </DialogDescription>
        </DialogHeader>

        <form
          id="aba-goal-form"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) => save.mutate({ input, goalId: goal?.id }, { onSuccess: onClose }))}
        >
          <FormField id="goal-title" label="Objetivo" required error={errors.title?.message}>
            <Input id="goal-title" aria-invalid={!!errors.title || undefined} {...form.register("title")} />
          </FormField>
          <FormField id="goal-description" label="Descrição" error={errors.description?.message}>
            <Textarea id="goal-description" rows={2} {...form.register("description")} />
          </FormField>
          <FormField
            id="goal-criterion"
            label="Critério de alcance"
            required
            error={errors.criterionText?.message}
            hint="Ex.: acertar de forma independente em tentativas de pedido de ajuda."
          >
            <Textarea id="goal-criterion" rows={2} aria-invalid={!!errors.criterionText || undefined} {...form.register("criterionText")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="goal-target" label="Meta de acertos (%)" required error={errors.targetPercent?.message}>
              <Input id="goal-target" type="number" inputMode="numeric" min={1} max={100} aria-invalid={!!errors.targetPercent || undefined} {...form.register("targetPercent", { valueAsNumber: true })} />
            </FormField>
            <FormField id="goal-sessions" label="Sessões consecutivas" required error={errors.consecutiveSessions?.message}>
              <Input id="goal-sessions" type="number" inputMode="numeric" min={1} max={10} aria-invalid={!!errors.consecutiveSessions || undefined} {...form.register("consecutiveSessions", { valueAsNumber: true })} />
            </FormField>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="aba-goal-form" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar objetivo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
