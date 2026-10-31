"use client"

import { ForbiddenError } from "@/domain/errors"
import { useCan } from "@/shared/lib/current-user"
import { ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"

import { usePatient } from "../queries"
import { PatientForm } from "./patient-form"

function Forbidden() {
  return <ErrorState error={new ForbiddenError()} />
}

export function NewPatientView() {
  const canWrite = useCan("patients:write")
  if (!canWrite) return <Forbidden />
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-(--page-gap)">
      <PageHeader eyebrow="Pacientes" title="Novo paciente" description="Campos com * são obrigatórios." />
      <PatientForm />
    </div>
  )
}

export function EditPatientView({ id }: { id: string }) {
  const canWrite = useCan("patients:write")
  const { data, isLoading, error, refetch } = usePatient(id)
  if (!canWrite) return <Forbidden />
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (isLoading || !data) return <ListSkeleton rows={6} />
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-(--page-gap)">
      <PageHeader eyebrow={data.code} title={`Editar ${data.socialName || data.fullName}`} />
      <PatientForm key={data.id + data.updatedAt} patient={data} />
    </div>
  )
}
