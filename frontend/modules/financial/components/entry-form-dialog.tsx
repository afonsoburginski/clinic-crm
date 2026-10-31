"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { Input } from "@/components/ui/input"
import { clinicDateKey } from "@/domain/clinic-time"
import { financialEntrySchema, type FinancialEntryInput } from "@/domain/schemas"
import type { FinancialEntry } from "@/domain/types"
import { useLookups } from "@/shared/lib/lookups"
import { FormField } from "@/shared/ui/molecules/form-field"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { useSaveEntry } from "../queries"

/** `entry` edita; `template` abre um lançamento novo já preenchido com os dados de outro (duplicar, sem pagamentos). */
export function EntryFormDialog({ entry, template, defaultCompetence, onClose }: { entry?: FinancialEntry; template?: FinancialEntry; defaultCompetence: string; onClose: () => void }) {
  const { patients } = useLookups()
  const save = useSaveEntry(entry?.id)
  const form = useForm<FinancialEntryInput>({
    resolver: zodResolver(financialEntrySchema),
    defaultValues: {
      kind: (entry ?? template)?.kind ?? "income",
      description: entry ? entry.description : template ? `${template.description} (cópia)`.slice(0, 120) : "",
      category: (entry ?? template)?.category ?? "",
      counterparty: (entry ?? template)?.counterparty ?? "",
      patientId: (entry ?? template)?.patientId ?? "",
      competence: entry?.competence ?? defaultCompetence,
      dueDate: entry?.dueDate ?? clinicDateKey(new Date()),
      amount: (entry ?? template) ? (entry ?? template)!.amountCents / 100 : undefined,
    },
  })
  const errors = form.formState.errors
  const patientId = form.watch("patientId")

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{entry ? `Editar ${entry.code}` : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            Lançamentos não guardam dado clínico. Pagamentos são registrados à parte, depois de criar o lançamento.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="entry-form" noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v, { onSuccess: onClose }))}>
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <HaloToggleGroup
                  items={[
                    { value: "income", label: "Receita" },
                    { value: "expense", label: "Despesa" },
                  ]}
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                  disabled={!!entry}
                  className="self-start"
                />
              )}
            />

            <FormField id="entry-description" label="Descrição" required error={errors.description?.message} hint="Máximo de 120 caracteres. Não inclua informações clínicas.">
              <Input id="entry-description" aria-invalid={!!errors.description || undefined} {...form.register("description")} />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="entry-category" label="Categoria" required error={errors.category?.message}>
                <Input id="entry-category" aria-invalid={!!errors.category || undefined} {...form.register("category")} />
              </FormField>
              <FormField id="entry-counterparty" label="Contraparte" error={errors.counterparty?.message} hint="Quem paga ou recebe, se couber.">
                <Input id="entry-counterparty" {...form.register("counterparty")} />
              </FormField>
            </div>

            <FormField id="entry-patient" label="Paciente (opcional)" hint="Só a referência administrativa; nenhum dado clínico é lido ou gravado.">
              <div className="flex gap-2">
                <Controller
                  control={form.control}
                  name="patientId"
                  render={({ field }) => (
                    <SimpleSelect
                      id="entry-patient"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Sem paciente"
                      options={patients.map((p) => ({ value: p.id, label: `${p.socialName || p.fullName} · ${p.code}` }))}
                    />
                  )}
                />
                {patientId && (
                  <Button type="button" variant="ghost" onClick={() => form.setValue("patientId", "")}>
                    Remover
                  </Button>
                )}
              </div>
            </FormField>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField id="entry-competence" label="Competência" required error={errors.competence?.message}>
                <Input id="entry-competence" type="month" aria-invalid={!!errors.competence || undefined} {...form.register("competence")} />
              </FormField>
              <FormField id="entry-due" label="Vencimento" required error={errors.dueDate?.message}>
                <Input id="entry-due" type="date" aria-invalid={!!errors.dueDate || undefined} {...form.register("dueDate")} />
              </FormField>
              <FormField id="entry-amount" label="Valor (R$)" required error={errors.amount?.message}>
                <Input id="entry-amount" type="number" inputMode="decimal" step="0.01" min="0" aria-invalid={!!errors.amount || undefined} {...form.register("amount", { valueAsNumber: true })} />
              </FormField>
            </div>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="entry-form" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : entry ? "Salvar" : "Criar lançamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
