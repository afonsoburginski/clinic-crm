"use client"

import { CalendarPlus, CalendarX2, PencilLine } from "lucide-react"
import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Patient } from "@/domain/types"
import { AppointmentLine } from "@/modules/scheduling/components/appointment-line"
import { formatAge, formatBirthDate, formatDate } from "@/shared/lib/format"
import { useCan } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { StatePill } from "@/shared/ui/atoms/state-pill"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { usePatient, usePatientAppointments } from "../queries"
import { GuardianLinksSection } from "./guardian-links-section"
import { PatientStatusPill } from "./patient-status-pill"

export function PatientDetailView({ id }: { id: string }) {
  const { data: patient, isLoading, error, refetch } = usePatient(id)
  const canWrite = useCan("patients:write")
  const canSchedule = useCan("appointments:write")

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (isLoading || !patient) return <ListSkeleton rows={6} />

  const displayName = patient.socialName || patient.fullName

  return (
    <>
      <PageHeader
        back={{ href: "/pacientes", label: "Pacientes" }}
        leading={<PersonAvatar name={displayName} size="lg" />}
        title={displayName}
        badge={<PatientStatusPill status={patient.status} />}
        description={
          <>
            <span className="font-mono">{patient.code}</span> · {formatAge(patient.birthDate)}
            {patient.socialName && <> · Registro civil: {patient.fullName}</>}
          </>
        }
        actions={
          <>
            {canWrite && (
              <Link href={`/pacientes/${patient.id}/editar`} className={buttonVariants({ variant: "outline" })}>
                <PencilLine aria-hidden />
                Editar
              </Link>
            )}
            {canSchedule && patient.status === "active" && (
              <Link href={`/agenda?novo=1&paciente=${patient.id}`} className={buttonVariants()}>
                <CalendarPlus aria-hidden />
                Agendar
              </Link>
            )}
          </>
        }
      />

      <Tabs defaultValue="cadastro" className="gap-4">
        <TabsList>
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="responsaveis">Responsáveis</TabsTrigger>
          <TabsTrigger value="agendamentos">Agendamentos</TabsTrigger>
        </TabsList>
        <TabsContent value="cadastro">
          <PatientSummary patient={patient} />
        </TabsContent>
        <TabsContent value="responsaveis">
          <GuardianLinksSection patient={patient} />
        </TabsContent>
        <TabsContent value="agendamentos">
          <PatientAppointments patientId={patient.id} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">Não informado</span>}</dd>
    </div>
  )
}

function PatientSummary({ patient }: { patient: Patient }) {
  const { professional } = useLookups()
  const pro = patient.mainProfessionalId ? professional.get(patient.mainProfessionalId) : undefined

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <SectionCard title="Dados cadastrais">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <InfoItem label="Nascimento">{formatBirthDate(patient.birthDate)}</InfoItem>
          <InfoItem label="CPF">{patient.document && <span className="font-mono">{patient.document}</span>}</InfoItem>
          <InfoItem label="Telefone">{patient.phone}</InfoItem>
          <InfoItem label="E-mail">{patient.email}</InfoItem>
          <div className="sm:col-span-2">
            <InfoItem label="Endereço">{patient.address}</InfoItem>
          </div>
          <InfoItem label="Profissional de referência">{pro?.name}</InfoItem>
          <InfoItem label="Cadastrado em">{patient.createdAt ? formatDate(patient.createdAt) : "—"}</InfoItem>
        </dl>
      </SectionCard>
      <div className="flex flex-col gap-6">
        <SectionCard title="Consentimentos" bodyClassName="flex flex-wrap gap-2">
          <StatePill tone={patient.consentData ? "positive" : "warning"}>
            {patient.consentData ? "Dados autorizados" : "Dados sem consentimento"}
          </StatePill>
          <StatePill tone={patient.consentImage ? "positive" : "muted"}>
            {patient.consentImage ? "Imagem autorizada" : "Imagem não autorizada"}
          </StatePill>
        </SectionCard>
        <SectionCard title="Observações administrativas">
          <p className="text-sm leading-relaxed text-pretty whitespace-pre-line">
            {patient.administrativeNotes || <span className="text-muted-foreground">Sem observações.</span>}
          </p>
        </SectionCard>
      </div>
    </div>
  )
}

function PatientAppointments({ patientId }: { patientId: string }) {
  const { data, isLoading, error, refetch } = usePatientAppointments(patientId)

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <SectionCard title="Histórico e próximos" description="Do mais recente para o mais antigo." bodyClassName="p-2">
      {isLoading ? (
        <ListSkeleton rows={4} className="p-2" />
      ) : data?.length ? (
        <ul className="flex flex-col">
          {data.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <span className="w-24 shrink-0 pl-3 text-xs text-muted-foreground tabular-nums">{formatDate(a.start)}</span>
              <div className="min-w-0 flex-1">
                <AppointmentLine appointment={a} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<CalendarX2 aria-hidden />} title="Nenhum agendamento ainda" />
      )}
    </SectionCard>
  )
}
