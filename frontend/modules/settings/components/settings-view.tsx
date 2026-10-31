"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ClinicSettings } from "@/domain/types"
import { settingsSchema } from "@/domain/schemas"
import { RolesTab } from "@/modules/users/components/roles-tab"
import { UsersTab } from "@/modules/users/components/users-tab"
import { useCan } from "@/shared/lib/current-user"
import { notifyError } from "@/shared/lib/notify"
import { AccessDenied } from "@/shared/ui/organisms/access-denied"
import { ErrorState, ListSkeleton } from "@/shared/ui/molecules/feedback-states"
import { FormField, SwitchField } from "@/shared/ui/molecules/form-field"
import { PageHeader } from "@/shared/ui/molecules/page-header"
import { SectionCard } from "@/shared/ui/molecules/section-card"

import { useClinicSettings, useUpdateSettings } from "../queries"

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

type Errors = Partial<Record<string, string>>

type SettingsTab = "clinica" | "usuarios" | "papeis"

/** Cada aba exige a sua permissão: a clínica, `settings:manage`; usuários e papéis, `users:read`. */
export function SettingsView() {
  const canClinic = useCan("settings:manage")
  const canUsers = useCan("users:read")
  const [chosen, setTab] = useState<SettingsTab | null>(null)
  const allowed: SettingsTab[] = [...(canClinic ? (["clinica"] as const) : []), ...(canUsers ? (["usuarios", "papeis"] as const) : [])]
  // A permissão chega depois da sessão: a aba escolhida só vale se ainda for permitida, senão abre a primeira.
  const tab = chosen && allowed.includes(chosen) ? chosen : allowed[0]

  if (!allowed.length) return <AccessDenied />

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Dados da clínica, expediente e regras da agenda; usuários, papéis e permissões de acesso."
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)} className="gap-4">
        <TabsList>
          {canClinic && <TabsTrigger value="clinica">Clínica</TabsTrigger>}
          {canUsers && <TabsTrigger value="usuarios">Usuários</TabsTrigger>}
          {canUsers && <TabsTrigger value="papeis">Papéis e permissões</TabsTrigger>}
        </TabsList>
        {canClinic && (
          <TabsContent value="clinica">
            <ClinicSettings />
          </TabsContent>
        )}
        {canUsers && (
          <TabsContent value="usuarios">
            <UsersTab />
          </TabsContent>
        )}
        {canUsers && (
          <TabsContent value="papeis">
            <RolesTab />
          </TabsContent>
        )}
      </Tabs>
    </>
  )
}

function ClinicSettings() {
  const query = useClinicSettings()

  return query.isPending ? (
    <ListSkeleton rows={6} />
  ) : query.isError ? (
    <ErrorState error={query.error} onRetry={() => query.refetch()} />
  ) : (
    <SettingsForm key={JSON.stringify(query.data)} initial={query.data} />
  )
}

function SettingsForm({ initial }: { initial: ClinicSettings }) {
  const [form, setForm] = useState<ClinicSettings>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const mutation = useUpdateSettings()
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  function set<K extends keyof ClinicSettings>(key: K, value: ClinicSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function setDay(weekday: number, patch: Partial<ClinicSettings["businessHours"][number]>) {
    setForm((f) => ({
      ...f,
      businessHours: f.businessHours.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)),
    }))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = settingsSchema.safeParse(form)
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        next[key] ??= issue.message
      }
      setErrors(next)
      return
    }
    const invalidDay = parsed.data.businessHours.find((d) => !d.closed && d.open >= d.close)
    if (invalidDay) {
      setErrors({ businessHours: `${WEEKDAYS[invalidDay.weekday]}: o fechamento deve ser depois da abertura.` })
      return
    }
    mutation.mutate(parsed.data, { onError: (error) => notifyError(error) })
  }

  const field = (key: keyof ClinicSettings) => ({
    id: `settings-${key}`,
    error: errors[key],
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard title="Dados da clínica" description="Aparecem em comprovantes e comunicações.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField {...field("name")} label="Nome fantasia" required>
              <Input id="settings-name" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
            </FormField>
            <FormField {...field("legalName")} label="Razão social" required>
              <Input id="settings-legalName" value={form.legalName} onChange={(e) => set("legalName", e.target.value)} aria-invalid={!!errors.legalName} />
            </FormField>
            <FormField {...field("document")} label="CNPJ" required>
              <Input id="settings-document" inputMode="numeric" value={form.document} onChange={(e) => set("document", e.target.value)} aria-invalid={!!errors.document} />
            </FormField>
            <FormField {...field("phone")} label="Telefone" required>
              <Input id="settings-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!errors.phone} />
            </FormField>
            <FormField {...field("email")} label="E-mail" required className="sm:col-span-2">
              <Input id="settings-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} />
            </FormField>
            <FormField {...field("address")} label="Endereço" required className="sm:col-span-2">
              <Input id="settings-address" value={form.address} onChange={(e) => set("address", e.target.value)} aria-invalid={!!errors.address} />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="Regras da agenda" description="Validadas em todo agendamento, remarcação e cancelamento.">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField {...field("minLeadMinutes")} label="Antecedência mínima" hint="minutos">
                <Input
                  id="settings-minLeadMinutes"
                  type="number"
                  min={0}
                  value={form.minLeadMinutes}
                  onChange={(e) => set("minLeadMinutes", Number(e.target.value))}
                  aria-invalid={!!errors.minLeadMinutes}
                />
              </FormField>
              <FormField {...field("lateToleranceMinutes")} label="Tolerância de atraso" hint="minutos">
                <Input
                  id="settings-lateToleranceMinutes"
                  type="number"
                  min={0}
                  value={form.lateToleranceMinutes}
                  onChange={(e) => set("lateToleranceMinutes", Number(e.target.value))}
                  aria-invalid={!!errors.lateToleranceMinutes}
                />
              </FormField>
              <FormField {...field("rescheduleWindowHours")} label="Janela de remarcação" hint="horas">
                <Input
                  id="settings-rescheduleWindowHours"
                  type="number"
                  min={0}
                  value={form.rescheduleWindowHours}
                  onChange={(e) => set("rescheduleWindowHours", Number(e.target.value))}
                  aria-invalid={!!errors.rescheduleWindowHours}
                />
              </FormField>
            </div>
            <SwitchField
              id="settings-requireCancelReason"
              label="Exigir motivo no cancelamento"
              description="O motivo fica registrado no histórico do atendimento e na auditoria."
              checked={form.requireCancelReason}
              onCheckedChange={(v) => set("requireCancelReason", v)}
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Expediente da clínica"
        description="Nenhum atendimento pode ser marcado fora destes horários, mesmo que a grade do profissional permita."
        bodyClassName="p-0"
      >
        <ul className="divide-y">
          {form.businessHours
            .slice()
            .sort((a, b) => a.weekday - b.weekday)
            .map((day) => (
              <li key={day.weekday} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
                <div className="flex w-36 items-center gap-3">
                  <Switch
                    id={`day-${day.weekday}`}
                    checked={!day.closed}
                    onCheckedChange={(open) => setDay(day.weekday, { closed: !open })}
                    aria-label={`${WEEKDAYS[day.weekday]} aberto`}
                  />
                  <label htmlFor={`day-${day.weekday}`} className="text-sm font-medium">
                    {WEEKDAYS[day.weekday]}
                  </label>
                </div>
                {day.closed ? (
                  <span className="text-sm text-muted-foreground">Fechado</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      className="w-32 font-mono"
                      value={day.open}
                      onChange={(e) => setDay(day.weekday, { open: e.target.value })}
                      aria-label={`${WEEKDAYS[day.weekday]}: abertura`}
                    />
                    <span className="text-sm text-muted-foreground">até</span>
                    <Input
                      type="time"
                      className="w-32 font-mono"
                      value={day.close}
                      onChange={(e) => setDay(day.weekday, { close: e.target.value })}
                      aria-label={`${WEEKDAYS[day.weekday]}: fechamento`}
                    />
                  </div>
                )}
              </li>
            ))}
        </ul>
        {errors.businessHours && (
          <p role="alert" className="border-t px-5 py-3 text-sm text-destructive">
            {errors.businessHours}
          </p>
        )}
      </SectionCard>

      <div className="glass-bar sticky bottom-3 z-20 flex items-center justify-end gap-3 rounded-xl border px-4 py-3 shadow-xs">
        {dirty && <span className="mr-auto text-sm text-muted-foreground">Alterações não salvas</span>}
        <Button
          type="button"
          variant="ghost"
          disabled={!dirty || mutation.isPending}
          onClick={() => {
            setForm(initial)
            setErrors({})
          }}
        >
          Descartar
        </Button>
        <Button type="submit" disabled={!dirty || mutation.isPending}>
          {mutation.isPending ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>
    </form>
  )
}
