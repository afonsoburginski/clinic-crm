"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CLASSIFICATION_LABELS, documentAccess } from "@/domain/documents"
import { documentSchema, type DocumentInput } from "@/domain/schemas"
import type { DocumentClassification, PatientDocument } from "@/domain/types"
import { useCurrentUser } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { FormDialog } from "@/shared/ui/molecules/form-dialog"
import { FormField } from "@/shared/ui/molecules/form-field"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { useClinicalDocumentRecords, useSaveDocument } from "../queries"

const CLASSES: DocumentClassification[] = ["clinical", "administrative", "financial"]

/**
 * Cria um documento em rascunho ou edita o rascunho existente (classificação e paciente não mudam).
 * `template` abre a criação já preenchida com os dados de outro rascunho (duplicar).
 */
export function DocumentFormDialog({ document, template, onClose }: { document?: PatientDocument; template?: PatientDocument; onClose: () => void }) {
  const { user } = useCurrentUser()
  const { patients } = useLookups()
  const save = useSaveDocument(document?.id)
  // Conveniência visual: o adaptador revalida a permissão por classificação.
  const writable = CLASSES.filter((c) => documentAccess(user, c, true).write)
  const form = useForm<DocumentInput>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      patientId: (document ?? template)?.patientId ?? "",
      title: document ? document.title : template ? `${template.title} (cópia)` : "",
      type: (document ?? template)?.type ?? "",
      classification: (document ?? template)?.classification ?? writable[0] ?? "administrative",
      clinicalRecordId: (document ?? template)?.clinicalRecordId ?? "",
      notes: (document ?? template)?.notes ?? "",
    },
  })
  const errors = form.formState.errors
  const classification = form.watch("classification")
  const patientId = form.watch("patientId")
  const records = useClinicalDocumentRecords(patientId, classification === "clinical" && !document)
  const roots = (records.data ?? []).filter((r) => r.id === r.rootId)

  return (
    <FormDialog
      size="md"
      title={document ? "Editar documento" : "Novo documento"}
      description="O documento nasce em rascunho. Só depois de emitido ele pode ser liberado, de forma explícita, a um responsável."
      formId="document-form"
      submitLabel="Salvar rascunho"
      pending={save.isPending}
      isDirty={form.formState.isDirty}
      submitDisabled={!document && !writable.length}
      onClose={onClose}
    >
      <form id="document-form" noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v, { onSuccess: onClose }))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="doc-patient" label="Paciente" required error={errors.patientId?.message}>
            <Controller
              control={form.control}
              name="patientId"
              render={({ field }) => (
                <SimpleSelect
                  id="doc-patient"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v)
                    form.setValue("clinicalRecordId", "")
                  }}
                  disabled={!!document}
                  invalid={!!errors.patientId}
                  options={patients.map((p) => ({ value: p.id, label: `${p.socialName || p.fullName} · ${p.code}` }))}
                  placeholder={patients.length ? "Selecione" : "Nenhum paciente disponível"}
                />
              )}
            />
          </FormField>
          <FormField id="doc-classification" label="Classificação" required>
            <Controller
              control={form.control}
              name="classification"
              render={({ field }) => (
                <SimpleSelect
                  id="doc-classification"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v)
                    form.setValue("clinicalRecordId", "")
                  }}
                  disabled={!!document}
                  options={(document ? CLASSES : writable).map((value) => ({ value, label: CLASSIFICATION_LABELS[value] }))}
                />
              )}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <FormField id="doc-title" label="Título" required error={errors.title?.message}>
            <Input id="doc-title" aria-invalid={!!errors.title || undefined} {...form.register("title")} />
          </FormField>
          <FormField id="doc-type" label="Tipo" required error={errors.type?.message}>
            <Input id="doc-type" placeholder="Laudo, termo, recibo…" aria-invalid={!!errors.type || undefined} {...form.register("type")} />
          </FormField>
        </div>

        {classification === "clinical" && (
          <FormField
            id="doc-record"
            label="Documento clínico do prontuário"
            required
            hint="O conteúdo clínico permanece no prontuário; aqui fica só a referência."
          >
            <Controller
              control={form.control}
              name="clinicalRecordId"
              render={({ field }) => (
                <SimpleSelect
                  id="doc-record"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={!!document || !patientId}
                  options={roots.map((r) => ({ value: r.id, label: r.title }))}
                  placeholder={!patientId ? "Selecione o paciente" : roots.length ? "Selecione" : "Nenhum documento clínico no prontuário"}
                />
              )}
            />
          </FormField>
        )}

        <FormField id="doc-notes" label="Observações administrativas" error={errors.notes?.message} hint="Não inclua conteúdo clínico aqui.">
          <Textarea id="doc-notes" rows={3} {...form.register("notes")} />
        </FormField>
      </form>
    </FormDialog>
  )
}
