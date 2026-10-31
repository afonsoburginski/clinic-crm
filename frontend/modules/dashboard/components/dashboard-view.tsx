"use client"

import { CalendarPlus, CalendarX2 } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { formatDateLong } from "@/shared/lib/format"
import { useCan, useCurrentUser } from "@/shared/lib/current-user"
import { nowInClinic } from "@/domain/clinic-time"
import { AppointmentLine } from "@/modules/scheduling/components/appointment-line"
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"
import { StatTile } from "@/shared/ui/molecules/stat-tile"

import { useDashboardSummary } from "../queries"
import { OccupancyList } from "./occupancy-list"

function greeting() {
  const h = nowInClinic().getHours()
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"
}

export function DashboardView() {
  const { user } = useCurrentUser()
  const canSchedule = useCan("appointments:write")
  const { data, isLoading, error, refetch } = useDashboardSummary()

  return (
    <>
      <PageHeader
        eyebrow={formatDateLong(nowInClinic())}
        title={`${greeting()}, ${user?.name.split(" ")[0]}`}
        description={
          data?.scoped
            ? "Seus atendimentos e sua ocupação na semana."
            : "Como a clínica está hoje e o que vem pela frente."
        }
        actions={
          canSchedule && (
            <Link href="/agenda?novo=1" className={buttonVariants()}>
              <CalendarPlus aria-hidden />
              Novo agendamento
            </Link>
          )
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <section aria-label="Indicadores de hoje" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Atendimentos hoje" value={data?.today.total ?? 0} hint={`${data?.today.completed ?? 0} concluídos`} />
            <StatTile label="Confirmados" value={data?.today.confirmed ?? 0} hint={`${data?.today.inProgress ?? 0} em andamento`} />
            <StatTile label="Aguardando confirmação" value={data?.week.awaiting ?? 0} hint="nesta semana" />
            <StatTile
              label={data?.scoped ? "Meus pacientes" : "Pacientes ativos"}
              value={data?.activePatients ?? 0}
              hint={`${data?.week.cancelled ?? 0} cancelamentos · ${data?.week.noShow ?? 0} faltas na semana`}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <SectionCard
              title="Próximos atendimentos"
              description="Os próximos horários ainda não encerrados."
              actions={
                <Link href="/agenda" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Ver agenda
                </Link>
              }
              bodyClassName="p-2"
            >
              {isLoading ? (
                <ListSkeleton rows={5} className="p-2" />
              ) : data?.upcoming.length ? (
                <ul className="flex flex-col">
                  {data.upcoming.map((a) => (
                    <li key={a.id}>
                      <AppointmentLine appointment={a} showDay />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<CalendarX2 aria-hidden />}
                  title="Nada agendado por enquanto"
                  description="Quando houver atendimentos futuros eles aparecem aqui."
                />
              )}
            </SectionCard>

            <SectionCard title="Ocupação da semana" description="Horas agendadas sobre a grade disponível.">
              {isLoading ? <ListSkeleton rows={5} /> : <OccupancyList items={data?.occupancy ?? []} />}
            </SectionCard>
          </div>
        </>
      )}
    </>
  )
}
