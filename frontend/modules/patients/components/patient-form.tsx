"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useDeferredValue, useEffect } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { patientSchema, type PatientInput } from "@/domain/schemas"
import type { Patient } from "@/domain/types"
import { formatBirthDate, maskCPF, maskPhone } from "@/shared/lib/format"
import { useLookups } from "@/shared/lib/lookups"
import { FormField, SwitchField } from "@/shared/ui/molecules/form-field"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { patientToInput } from "../lib/patient-input"
import { PATIENT_STATUS_LABELS, usePossibleDuplicates, useSavePatient } from "../queries"

export const PATIENT_FORM_ID = "patient-form"

/** Estado que o dialog precisa para o rodapé (enviar/desabilitar) e para confirmar o descarte. */
export interface PatientFormState {
  isDirty: boolean
  pending: boolean
}

/**
 * Campos do cadastro de paciente. Vive dentro do `DialogBody` de `PatientFormDialog`: o botão de enviar fica no rodapé
 * fixo do dialog (`form={PATIENT_FORM_ID}`), então o formulário só informa `isDirty`/`pending` por `onStateChange`.
 */
export function PatientForm({
  patient,
  onSaved,
  onStateChange,
}: {
  patient?: Patient
  onSaved: (saved: Patient) => void
  onStateChange?: (state: PatientFormState) => void
}) {
  const { professionals } = useLookups()
  const save = useSavePatient(patient?.id)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<PatientInput>({ resolver: zodResolver(patientSchema), defaultValues: patientToInput(patient) })

  const [fullName, birthDate, document] = useWatch({ control, name: ["fullName", "birthDate", "document"] })
  const deferredName = useDeferredValue(fullName)
  const deferredDocument = useDeferredValue(document)
  const { data: duplicates } = usePossibleDuplicates({
    fullName: deferredName,
    birthDate,
    document: deferredDocument,
    id: patient?.id,
  })

  const pending = save.isPending
  useEffect(() => onStateChange?.({ isDirty, pending }), [onStateChange, isDirty, pending])

  const onSubmit = handleSubmit((values) => save.mutate(values, { onSuccess: onSaved }))

  const field = (name: keyof PatientInput) => ({
    id: `patient-${name}`,
    "aria-invalid": !!errors[name] || undefined,
    "aria-describedby": errors[name] ? `patient-${name}-error` : undefined,
  })

  return (
    <form id={PATIENT_FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {!!duplicates?.length && (
        <div role="status" className="flex gap-3 rounded-xl border border-accent bg-accent/40 p-4 text-accent-foreground">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">Possível cadastro duplicado</p>
            <ul className="flex flex-col gap-1">
              {duplicates.slice(0, 3).map((d) => (
                <li key={d.patient.id} className="leading-relaxed">
                  <Link href={`/pacientes/${d.patient.id}`} className="font-medium underline underline-offset-2" target="_blank">
                    {d.patient.fullName}
                  </Link>{" "}
                  <span className="opacity-80">
                    ({d.patient.code} · {formatBirthDate(d.patient.birthDate)}) — {d.reasons.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs opacity-80">Confira antes de salvar. Você ainda pode prosseguir se for outra pessoa.</p>
          </div>
        </div>
      )}

      <SectionCard title="Identificação" bodyClassName="grid gap-4 sm:grid-cols-2">
        <FormField id="patient-fullName" label="Nome completo" required error={errors.fullName?.message} className="sm:col-span-2">
          <Input {...register("fullName")} {...field("fullName")} autoComplete="off" />
        </FormField>
        <FormField id="patient-socialName" label="Nome social" hint="Usado em toda a interface quando preenchido." error={errors.socialName?.message}>
          <Input {...register("socialName")} {...field("socialName")} />
        </FormField>
        <FormField id="patient-birthDate" label="Data de nascimento" required error={errors.birthDate?.message}>
          <Input type="date" {...register("birthDate")} {...field("birthDate")} />
        </FormField>
        <FormField id="patient-document" label="CPF" error={errors.document?.message}>
          <Controller
            control={control}
            name="document"
            render={({ field: f }) => (
              <Input
                {...field("document")}
                inputMode="numeric"
                value={f.value}
                onBlur={f.onBlur}
                onChange={(e) => f.onChange(maskCPF(e.target.value))}
                placeholder="000.000.000-00"
              />
            )}
          />
        </FormField>
        <FormField id="patient-status" label="Situação">
          <Controller
            control={control}
            name="status"
            render={({ field: f }) => (
              <SimpleSelect
                id="patient-status"
                value={f.value}
                onChange={f.onChange}
                options={Object.entries(PATIENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              />
            )}
          />
        </FormField>
      </SectionCard>

      <SectionCard title="Contato" bodyClassName="grid gap-4 sm:grid-cols-2">
        <FormField id="patient-phone" label="Telefone" error={errors.phone?.message}>
          <Controller
            control={control}
            name="phone"
            render={({ field: f }) => (
              <Input
                {...field("phone")}
                type="tel"
                inputMode="tel"
                value={f.value}
                onBlur={f.onBlur}
                onChange={(e) => f.onChange(maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
              />
            )}
          />
        </FormField>
        <FormField id="patient-email" label="E-mail" error={errors.email?.message}>
          <Input type="email" {...register("email")} {...field("email")} />
        </FormField>
        <FormField id="patient-address" label="Endereço" error={errors.address?.message} className="sm:col-span-2">
          <Input {...register("address")} {...field("address")} />
        </FormField>
      </SectionCard>

      <SectionCard title="Acompanhamento" bodyClassName="grid gap-4">
        <FormField id="patient-mainProfessionalId" label="Profissional de referência">
          <Controller
            control={control}
            name="mainProfessionalId"
            render={({ field: f }) => (
              <SimpleSelect
                id="patient-mainProfessionalId"
                value={f.value}
                onChange={f.onChange}
                placeholder="Sem profissional de referência"
                options={[
                  { value: "", label: "Sem profissional de referência" },
                  ...professionals.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <Controller
            control={control}
            name="consentData"
            render={({ field: f }) => (
              <SwitchField
                id="patient-consentData"
                label="Consentimento de dados (LGPD)"
                description="Autoriza o tratamento dos dados para fins de atendimento."
                checked={f.value}
                onCheckedChange={f.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="consentImage"
            render={({ field: f }) => (
              <SwitchField
                id="patient-consentImage"
                label="Uso de imagem"
                description="Autoriza registros em foto ou vídeo nas sessões."
                checked={f.value}
                onCheckedChange={f.onChange}
              />
            )}
          />
        </div>
        <FormField
          id="patient-administrativeNotes"
          label="Observações administrativas"
          hint="Sem informação clínica — apenas dados operacionais."
          error={errors.administrativeNotes?.message}
        >
          <Textarea rows={3} {...register("administrativeNotes")} {...field("administrativeNotes")} />
        </FormField>
      </SectionCard>
    </form>
  )
}
