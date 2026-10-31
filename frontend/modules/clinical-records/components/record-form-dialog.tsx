"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RECORD_KIND_LABELS } from "@/domain/clinical-record"
import { clinicalRecordSchema, type ClinicalRecordInput } from "@/domain/schemas"
import type { ClinicalRecord, ClinicalRecordKind } from "@/domain/types"
import { useCurrentUser } from "@/shared/lib/current-user"
import { formatDateTime } from "@/shared/lib/format"
import { useLookups } from "@/shared/lib/lookups"
import { FormDialog } from "@/shared/ui/molecules/form-dialog"
import { FormField } from "@/shared/ui/molecules/form-field"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { usePatientAppointmentsForRecords, useSaveRecord } from "../queries"

const KIND_OPTIONS = (Object.keys(RECORD_KIND_LABELS) as ClinicalRecordKind[]).map((value) => ({ value, label: RECORD_KIND_LABELS[value] }))

/** Cria um rascunho ou edita um rascunho existente (inclusive o de uma retificação). */
export function RecordFormDialog({ patientId, record, onClose }: { patientId: string; record?: ClinicalRecord; onClose: () => void }) {
  const { user } = useCurrentUser()
  const { service } = useLookups()
  const save = useSaveRecord(patientId, record?.id)
  const form = useForm<ClinicalRecordInput>({
    resolver: zodResolver(clinicalRecordSchema),
    defaultValues: {
      kind: record?.kind ?? "evolution",
      title: record?.title ?? "",
      content: record?.content ?? "",
      appointmentId: record?.appointmentId ?? "",
    },
  })
  const errors = form.formState.errors
  const kind = form.watch("kind")
  const appointmentId = form.watch("appointmentId")
  const { data: appointments } = usePatientAppointmentsForRecords(patientId, kind === "evolution")

  const appointmentOptions = (appointments ?? [])
    .filter((a) => a.kind === "appointment" && a.professionalId === user?.professionalId)
    .map((a) => ({
      value: a.id,
      label: `${formatDateTime(a.start)} · ${(a.serviceId && service.get(a.serviceId)?.name) || "Atendimento"}`,
    }))

  return (
    <FormDialog
      size="lg"
      title={record?.rectifiesId ? "Editar retificação" : record ? "Editar rascunho" : "Novo registro"}
      description={
        record?.rectifiesId
          ? `Versão ${record.version} em rascunho. A versão anterior só passa a "retificada" quando você finalizar esta.`
          : "O registro nasce como rascunho. Depois de finalizado, o conteúdo não pode mais ser editado — correções são feitas por retificação."
      }
      formId="record-form"
      submitLabel="Salvar rascunho"
      pending={save.isPending}
      isDirty={form.formState.isDirty}
      onClose={onClose}
    >
      {record?.rectificationReason && (
        <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Motivo da retificação:</span> {record.rectificationReason}
        </p>
      )}

      <form id="record-form" noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}>
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <FormField id="record-kind" label="Tipo" required>
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <SimpleSelect id="record-kind" value={field.value} onChange={field.onChange} options={KIND_OPTIONS} disabled={!!record} />
              )}
            />
          </FormField>
          <FormField id="record-title" label="Título" required error={errors.title?.message}>
            <Input id="record-title" aria-invalid={!!errors.title || undefined} {...form.register("title")} />
          </FormField>
        </div>

        {kind === "evolution" && (
          <FormField id="record-appointment" label="Atendimento (opcional)" hint="Vincule a evolução a um atendimento seu com este paciente.">
            <div className="flex gap-2">
              <Controller
                control={form.control}
                name="appointmentId"
                render={({ field }) => (
                  <SimpleSelect
                    id="record-appointment"
                    value={field.value}
                    onChange={field.onChange}
                    options={appointmentOptions}
                    placeholder={appointmentOptions.length ? "Sem vínculo" : "Nenhum atendimento seu encontrado"}
                    disabled={!appointmentOptions.length}
                  />
                )}
              />
              {appointmentId && (
                <Button type="button" variant="ghost" onClick={() => form.setValue("appointmentId", "")}>
                  Remover
                </Button>
              )}
            </div>
          </FormField>
        )}

        <FormField id="record-content" label="Conteúdo" error={errors.content?.message} hint="Mínimo de 20 caracteres para finalizar.">
          <Textarea id="record-content" rows={12} aria-invalid={!!errors.content || undefined} {...form.register("content")} />
        </FormField>
      </form>
    </FormDialog>
  )
}
