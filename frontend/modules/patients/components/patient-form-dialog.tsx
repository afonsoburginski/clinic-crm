"use client"

import { useState } from "react"

import type { Patient } from "@/domain/types"
import { FormDialog } from "@/shared/ui/molecules/form-dialog"

import { PATIENT_FORM_ID, PatientForm, type PatientFormState } from "./patient-form"

/**
 * Criar/editar paciente por cima da lista ou da ficha (sem trocar de tela). Reaproveita `PatientForm`.
 * Aberto por `?novo=1` (lista) ou `?editar=<id>` (lista) / `?editar=1` (ficha).
 */
export function PatientFormDialog({ patient, onClose }: { patient?: Patient; onClose: () => void }) {
  const [state, setState] = useState<PatientFormState>({ isDirty: false, pending: false })
  const name = patient ? patient.socialName || patient.fullName : ""

  return (
    <FormDialog
      size="xl"
      title={patient ? `Editar ${name}` : "Novo paciente"}
      description={patient ? patient.code : "Campos com * são obrigatórios."}
      formId={PATIENT_FORM_ID}
      submitLabel={patient ? "Salvar alterações" : "Cadastrar paciente"}
      pending={state.pending}
      isDirty={state.isDirty}
      submitDisabled={!!patient && !state.isDirty}
      onClose={onClose}
    >
      <PatientForm patient={patient} onSaved={onClose} onStateChange={setState} />
    </FormDialog>
  )
}
