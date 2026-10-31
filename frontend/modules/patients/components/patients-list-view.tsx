"use client"

import { UserRoundPlus, UsersRound } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import type { Patient, PatientStatus } from "@/domain/types"
import { ageInYears, formatAge, formatBirthDate } from "@/shared/lib/format"
import { useCan } from "@/shared/lib/current-user"
import { useLookups } from "@/shared/lib/lookups"
import { useUrlEditor } from "@/shared/lib/use-url-dialog"
import { PersonAvatar } from "@/shared/ui/atoms/person-avatar"
import { ProDot } from "@/shared/ui/atoms/pro-color"
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { patientActions } from "../lib/patient-actions"
import { PATIENT_STATUS_LABELS, usePatients, useSetPatientStatus } from "../queries"
import { PatientFormDialog } from "./patient-form-dialog"
import { PatientStatusPill } from "./patient-status-pill"

const STATUS_OPTIONS = (Object.keys(PATIENT_STATUS_LABELS) as PatientStatus[]).map((value) => ({ value, label: PATIENT_STATUS_LABELS[value] }))

export function PatientsListView() {
  const router = useRouter()
  const canWrite = useCan("patients:write")
  const canReadAll = useCan("patients:read")
  const { professionals, professional } = useLookups()
  const { data, isLoading, error, refetch, isPlaceholderData } = usePatients({ status: "all" })
  const setStatus = useSetPatientStatus()
  const editor = useUrlEditor({ items: data, isLoading, allowed: canWrite })

  const columns = useMemo<DataTableColumn<Patient>[]>(
    () => [
      {
        id: "patient",
        header: "Paciente",
        accessorFn: (p) => p.socialName || p.fullName,
        meta: {
          label: "Paciente",
          alwaysVisible: true,
          searchValue: (p) => [p.fullName, p.socialName, p.code, p.document, p.document?.replace(/\D/g, "")].filter(Boolean).join(" "),
        },
        cell: ({ row: { original: p } }) => (
          <div className="flex items-center gap-3">
            <PersonAvatar name={p.socialName || p.fullName} size="sm" />
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/pacientes/${p.id}`}
                className="truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {p.socialName || p.fullName}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
            </div>
          </div>
        ),
      },
      {
        id: "birthDate",
        header: "Nascimento",
        accessorFn: (p) => p.birthDate,
        meta: {
          label: "Nascimento",
          hideBelow: "md",
          filter: { kind: "range", label: "Idade", unit: "anos", value: (p) => (p.birthDate ? ageInYears(p.birthDate) : null) },
        },
        cell: ({ row: { original: p } }) => (
          <div className="flex flex-col">
            <span>{formatBirthDate(p.birthDate)}</span>
            <span className="text-xs text-muted-foreground">{formatAge(p.birthDate)}</span>
          </div>
        ),
      },
      {
        id: "professional",
        header: "Profissional de referência",
        accessorFn: (p) => (p.mainProfessionalId ? (professional.get(p.mainProfessionalId)?.name ?? "") : ""),
        meta: {
          label: "Profissional de referência",
          hideBelow: "lg",
          searchValue: (p) => (p.mainProfessionalId ? (professional.get(p.mainProfessionalId)?.name ?? "") : ""),
          filter: {
            kind: "multiselect",
            label: "Profissional",
            options: professionals.map((pro) => ({ value: pro.id, label: pro.name })),
            value: (p) => p.mainProfessionalId,
          },
        },
        cell: ({ row: { original: p } }) => {
          const pro = p.mainProfessionalId ? professional.get(p.mainProfessionalId) : undefined
          return pro ? (
            <span className="flex items-center gap-2">
              <ProDot colorIndex={pro.colorIndex} />
              {pro.name}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      },
      {
        id: "contact",
        header: "Contato",
        accessorFn: (p) => p.phone || p.email || "",
        meta: { label: "Contato", hideBelow: "sm", className: "text-muted-foreground", searchValue: (p) => `${p.phone ?? ""} ${p.email ?? ""}` },
        cell: ({ row: { original: p } }) => p.phone || p.email || "—",
      },
      {
        id: "status",
        header: "Situação",
        accessorFn: (p) => PATIENT_STATUS_LABELS[p.status],
        meta: {
          label: "Situação",
          align: "right",
          filter: { kind: "status", label: "Situação", options: STATUS_OPTIONS, value: (p) => p.status },
        },
        cell: ({ row: { original: p } }) => <PatientStatusPill status={p.status} />,
      },
    ],
    [professional, professionals]
  )

  return (
    <>
      <PageHeader
        title="Pacientes"
        description={canReadAll ? "Cadastro central de pacientes da clínica." : "Pacientes que você atende."}
        actions={
          canWrite && (
            <Button onClick={editor.openNew}>
              <UserRoundPlus aria-hidden />
              Novo paciente
            </Button>
          )
        }
      />

      <SectionCard bodyClassName="p-0">
        <DataTable
          label="Pacientes"
          tableKey="patients"
          columns={columns}
          data={data ?? []}
          getRowId={(p) => p.id}
          defaultState={{ filters: { status: ["active"] }, sort: [{ id: "patient", desc: false }] }}
          searchPlaceholder="Nome, código ou CPF"
          isLoading={isLoading}
          isRefreshing={isPlaceholderData}
          error={error}
          onRetry={() => refetch()}
          noun={["paciente", "pacientes"]}
          empty={{ icon: <UsersRound aria-hidden />, title: "Nenhum paciente cadastrado" }}
          onRowClick={(p) => router.push(`/pacientes/${p.id}`)}
          rowLabel={(p) => p.socialName || p.fullName}
          rowActions={(p) =>
            patientActions(p, {
              onView: () => router.push(`/pacientes/${p.id}`),
              onEdit: () => editor.openEdit(p),
              onSchedule: () => router.push(`/agenda?novo=1&paciente=${p.id}`),
              onSetStatus: (status) => setStatus.mutate({ patient: p, status }),
            })
          }
        />
      </SectionCard>

      {(editor.creating || editor.editing) && (
        <PatientFormDialog key={editor.editing?.id ?? "novo"} patient={editor.editing} onClose={editor.close} />
      )}
    </>
  )
}
