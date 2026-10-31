"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HaloToggleGroup } from "@/components/ui/halo-toggle-group"
import { Input } from "@/components/ui/input"
import { guardianLinkSchema, guardianSchema, type GuardianInput, type GuardianLinkInput } from "@/domain/schemas"
import type { Patient, PatientGuardianLink } from "@/domain/types"
import { FormField, SwitchField } from "@/shared/ui/molecules/form-field"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { useGuardians, useLinkGuardian, useSaveGuardian } from "../queries"
import { GuardianFields } from "./guardian-fields"

type Mode = "existing" | "new"

export function GuardianLinkDialog({
  patient,
  link,
  linkedGuardianIds,
  onClose,
}: {
  patient: Patient
  link?: PatientGuardianLink
  linkedGuardianIds: string[]
  onClose: () => void
}) {
  const [mode, setMode] = useState<Mode>("existing")
  const { data: guardians } = useGuardians("")
  const linkMutation = useLinkGuardian(patient.id)
  const createGuardian = useSaveGuardian()

  const linkForm = useForm<GuardianLinkInput>({
    resolver: zodResolver(mode === "new" ? guardianLinkSchema.omit({ guardianId: true }) : guardianLinkSchema) as never,
    defaultValues: {
      guardianId: link?.guardianId ?? "",
      relationship: link?.relationship ?? "",
      isLegalGuardian: link?.isLegalGuardian ?? false,
      canSchedule: link?.canSchedule ?? true,
      canReceiveDocuments: link?.canReceiveDocuments ?? false,
      isPrimaryContact: link?.isPrimaryContact ?? linkedGuardianIds.length === 0,
      restrictions: link?.restrictions ?? "",
    },
  })
  const guardianForm = useForm<GuardianInput>({
    resolver: zodResolver(guardianSchema),
    defaultValues: { fullName: "", document: "", phone: "", email: "" },
  })

  const pending = linkMutation.isPending || createGuardian.isPending
  const errors = linkForm.formState.errors

  const submit = linkForm.handleSubmit(async (values) => {
    let guardianId = values.guardianId
    if (!link && mode === "new") {
      const valid = await guardianForm.trigger()
      if (!valid) return
      const created = await createGuardian.mutateAsync(guardianForm.getValues())
      guardianId = created.id
    }
    linkMutation.mutate({ input: { ...values, guardianId }, linkId: link?.id }, { onSuccess: onClose })
  })

  const options = (guardians ?? [])
    .filter(({ guardian }) => guardian.id === link?.guardianId || !linkedGuardianIds.includes(guardian.id))
    .map(({ guardian }) => ({ value: guardian.id, label: `${guardian.fullName} · ${guardian.phone}` }))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{link ? "Editar vínculo" : "Vincular responsável"}</DialogTitle>
          <DialogDescription>Paciente: {patient.socialName || patient.fullName}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="guardian-link-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
            {!link && (
              <HaloToggleGroup
                items={[
                  { value: "existing", label: "Responsável existente" },
                  { value: "new", label: "Novo cadastro" },
                ]}
                value={mode}
                onValueChange={(v) => v && setMode(v as Mode)}
                className="self-start"
              />
            )}

            {!link && mode === "new" ? (
              <GuardianFields form={guardianForm} />
            ) : (
              <FormField id="link-guardianId" label="Responsável" required error={errors.guardianId?.message}>
                <Controller
                  control={linkForm.control}
                  name="guardianId"
                  render={({ field }) => (
                    <SimpleSelect
                      id="link-guardianId"
                      value={field.value}
                      onChange={field.onChange}
                      options={options}
                      disabled={!!link}
                      invalid={!!errors.guardianId}
                      placeholder={options.length ? "Selecione" : "Nenhum responsável disponível"}
                    />
                  )}
                />
              </FormField>
            )}

            <FormField id="link-relationship" label="Parentesco" required error={errors.relationship?.message}>
              <Input
                id="link-relationship"
                placeholder="Mãe, pai, avó, tutor…"
                aria-invalid={!!errors.relationship || undefined}
                {...linkForm.register("relationship")}
              />
            </FormField>

            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["isPrimaryContact", "Contato principal"],
                  ["isLegalGuardian", "Responsável legal"],
                  ["canSchedule", "Pode agendar"],
                  ["canReceiveDocuments", "Recebe documentos"],
                ] as const
              ).map(([name, label]) => (
                <Controller
                  key={name}
                  control={linkForm.control}
                  name={name}
                  render={({ field }) => (
                    <SwitchField id={`link-${name}`} label={label} checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              ))}
            </div>

            <FormField id="link-restrictions" label="Restrições" hint="Ex.: não pode retirar o paciente sem autorização.">
              <Input id="link-restrictions" {...linkForm.register("restrictions")} />
            </FormField>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button type="submit" form="guardian-link-form" disabled={pending}>
            {pending ? "Salvando…" : link ? "Salvar vínculo" : "Vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
