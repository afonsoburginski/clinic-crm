import { addDays, endOfDay, startOfDay, startOfWeek } from "date-fns"

import { canUserTransition, INACTIVE_STATUSES, STATUS_LABELS } from "@/domain/appointment-status"
import { clinicDateTimeToISO, nowInClinic, toMinutes } from "@/domain/clinic-time"
import { findPossibleDuplicates } from "@/domain/duplicate-detection"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors"
import { canReadAppointment, isScopedToOwnAgenda } from "@/domain/permissions"
import { findConflicts, suggestNextSlot, type ConflictContext, type SlotCandidate } from "@/domain/scheduling"
import {
  loginSchema,
  guardianLinkSchema,
  guardianSchema,
  patientSchema,
  professionalSchema,
  roomSchema,
  serviceSchema,
  settingsSchema,
  specialtySchema,
  unavailabilitySchema,
  weeklySlotSchema,
  type AppointmentInput,
  type GuardianInput,
  type GuardianLinkInput,
  type LoginInput,
  type PatientInput,
  type ProfessionalInput,
  type RoomInput,
  type ServiceInput,
  type SettingsInput,
  type SpecialtyInput,
  type UnavailabilityInput,
} from "@/domain/schemas"
import type { Appointment, AppointmentStatus, Patient, PatientStatus, Professional, WeeklySlot } from "@/domain/types"
import { resetDB, uid } from "@/shared/lib/demo-db"
import { useSessionStore } from "@/shared/lib/session-store"

import {
  DEFAULT_SETTINGS,
  fromAuditResource,
  toAppointment,
  toAuditEntry,
  toGuardian,
  toGuardianLink,
  toPatient,
  toProfessional,
  toRoom,
  toService,
  toSettings,
  toSpecialty,
  toUser,
  type Row,
} from "./backend-mappers"
import { abaApi, assessmentsApi, clinicalRecordsApi } from "./demo-clinical"
import { actor, blankToUndefined, parse, requirePermission } from "./demo-context"
import { documentsApi } from "./demo-documents"
import { financialApi } from "./demo-financial"
import { http } from "./http-client"

// ---------------------------------------------------------------- helpers HTTP

const seg = encodeURIComponent

async function items(path: string, query?: Record<string, string | undefined>) {
  const body = await http.get<{ items?: Row[] }>(path, { query })
  return body.items ?? []
}

/** Perfis sem acesso a um recurso opcional recebem o valor neutro em vez de derrubar a tela inteira. */
const whenForbidden =
  <T>(fallback: T) =>
  (error: unknown) => {
    if (error instanceof ForbiddenError) return fallback
    throw error
  }

const byName = <T extends { name: string }>(list: T[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
const statusOf = (active: boolean) => (active ? "active" : "inactive")

// ---------------------------------------------------------------- auth

const auth = {
  /** Autentica na API e guarda a sessão (token + usuário) no store; devolve o usuário. */
  async signIn(input: LoginInput) {
    const parsed = loginSchema.safeParse(input)
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Dados inválidos.")
    const session = await http.post<{ user: Row; accessToken: string; expiresAt: string }>("/auth/login", {
      body: parsed.data,
      authenticated: false,
    })
    const user = toUser(session.user)
    useSessionStore.getState().signIn({ user, accessToken: session.accessToken, expiresAt: session.expiresAt })
    return user
  },
  /** Restaura a sessão a partir do token guardado; token inválido ou vencido encerra a sessão local. */
  async me() {
    const { user } = await http.get<{ user: Row }>("/auth/session")
    const current = toUser(user)
    useSessionStore.getState().setUser(current)
    return current
  },
  /** Encerra a sessão local na hora e revoga o token no servidor (falha de rede não impede a saída). */
  async signOut() {
    const { accessToken, signOut } = useSessionStore.getState()
    signOut()
    if (!accessToken) return
    await http.post("/auth/logout", { token: accessToken }).catch(() => undefined)
  },
  /** RF-AUTH-005: restaura só os dados locais dos módulos demo (prontuário, avaliações, ABA, financeiro, documentos). */
  async resetDemo(input: { confirm: true }) {
    requirePermission(actor(), "settings:manage")
    if (input?.confirm !== true) throw new ValidationError("Confirme a restauração dos dados de demonstração.")
    resetDB()
  },
}

// ---------------------------------------------------------------- patients

export interface PatientFilters {
  search?: string
  status?: PatientStatus | "all"
}

const PATIENT_LIST_TTL_MS = 5_000
let patientListCache: { token: string | null; at: number; promise: Promise<Patient[]> } | null = null

/**
 * A API só filtra por nome/CPF cru e o CPF é guardado com máscara, então busca, status e
 * duplicidade rodam no cliente sobre a lista completa. Cache curto evita um GET por tecla digitada.
 */
function loadPatients(): Promise<Patient[]> {
  const token = useSessionStore.getState().accessToken
  if (patientListCache && patientListCache.token === token && Date.now() - patientListCache.at < PATIENT_LIST_TTL_MS) {
    return patientListCache.promise
  }
  const promise = items("/patients").then((rows) => rows.map(toPatient))
  const entry = { token, at: Date.now(), promise }
  patientListCache = entry
  promise.catch(() => {
    if (patientListCache === entry) patientListCache = null
  })
  return promise
}

const invalidatePatients = () => {
  patientListCache = null
}

async function getPatient(id: string) {
  return toPatient(await http.get<Row>(`/patients/${seg(id)}`, { errors: { 404: "Paciente não encontrado." } }))
}

const digits = (value?: string) => value?.replace(/\D/g, "") ?? ""

async function assertUniqueDocument(document: string | undefined, selfId?: string) {
  const wanted = digits(document)
  if (!wanted) return
  const taken = (await loadPatients()).some((p) => p.id !== selfId && digits(p.document) === wanted)
  if (taken) throw new ValidationError("Já existe um paciente com este CPF.")
}

/** `address` não existe na tabela `patients` da API, então não é enviado. */
const patientBody = (d: PatientInput) => ({
  fullName: d.fullName,
  socialName: d.socialName,
  birthDate: d.birthDate,
  document: d.document,
  phone: d.phone,
  email: d.email,
  status: d.status,
  mainProfessionalId: d.mainProfessionalId,
  consentData: d.consentData,
  consentImage: d.consentImage,
  administrativeNotes: d.administrativeNotes,
})

const patients = {
  async list(filters: PatientFilters = {}) {
    const q = filters.search?.trim().toLowerCase()
    return (await loadPatients())
      .filter((p) => !filters.status || filters.status === "all" || p.status === filters.status)
      .filter(
        (p) =>
          !q ||
          p.fullName.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.socialName?.toLowerCase().includes(q) ||
          p.document?.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "§")
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"))
  },

  get: getPatient,

  async checkDuplicates(input: { fullName: string; birthDate?: string; document?: string; id?: string }) {
    return findPossibleDuplicates(input, await loadPatients())
  },

  async create(input: PatientInput) {
    const data = blankToUndefined(parse<PatientInput>(patientSchema, input))
    await assertUniqueDocument(data.document)
    const body = patientBody(data)
    const created = await http.post<Row>("/patients", { body })
    invalidatePatients()
    return toPatient({ ...body, ...created })
  },

  async update(id: string, input: PatientInput) {
    const data = parse<PatientInput>(patientSchema, input)
    await assertUniqueDocument(data.document, id)
    // Campo ausente no PATCH é ignorado; para limpar é preciso enviar `null`.
    await http.patch(`/patients/${seg(id)}`, {
      body: {
        ...patientBody(data),
        socialName: data.socialName || null,
        document: data.document || null,
        phone: data.phone || null,
        email: data.email || null,
        mainProfessionalId: data.mainProfessionalId || null,
        administrativeNotes: data.administrativeNotes || null,
      },
      errors: { 404: "Paciente não encontrado." },
    })
    invalidatePatients()
    return { ...(await getPatient(id)), updatedAt: new Date().toISOString() }
  },
}

// ---------------------------------------------------------------- guardians

const guardians = {
  async list(search?: string) {
    const [guardianRows, linkRows, allPatients] = await Promise.all([
      items("/guardians"),
      items("/patient-guardians"),
      loadPatients(),
    ])
    const links = linkRows.map(toGuardianLink)
    const patientById = new Map(allPatients.map((p) => [p.id, p]))
    const q = search?.trim().toLowerCase()
    return guardianRows
      .map(toGuardian)
      .filter((g) => !q || g.fullName.toLowerCase().includes(q) || g.phone.includes(q))
      .map((guardian) => ({
        guardian,
        patients: links
          .filter((l) => l.guardianId === guardian.id)
          .map((link) => ({ link, patient: patientById.get(link.patientId)! }))
          .filter((x) => x.patient),
      }))
      .sort((a, b) => a.guardian.fullName.localeCompare(b.guardian.fullName, "pt-BR"))
  },

  async create(input: GuardianInput) {
    const data = blankToUndefined(parse<GuardianInput>(guardianSchema, input))
    return toGuardian(await http.post<Row>("/guardians", { body: data }))
  },

  async update(id: string, input: GuardianInput) {
    const data = parse<GuardianInput>(guardianSchema, input)
    try {
      return toGuardian(
        await http.patch<Row>(`/guardians/${seg(id)}`, {
          body: { ...data, document: data.document || null, email: data.email || null },
        })
      )
    } catch (error) {
      // A API ainda não expõe PATCH /guardians/:id.
      if (error instanceof NotFoundError) throw new NotFoundError("A edição de responsáveis ainda não está disponível na API.")
      throw error
    }
  },

  async forPatient(patientId: string) {
    const [linkRows, guardianRows] = await Promise.all([items("/patient-guardians", { patientId }), items("/guardians")])
    const guardianById = new Map(guardianRows.map(toGuardian).map((g) => [g.id, g]))
    return linkRows
      .map(toGuardianLink)
      .map((link) => ({ link, guardian: guardianById.get(link.guardianId)! }))
      .filter((x) => x.guardian)
      .sort((a, b) => Number(b.link.isPrimaryContact) - Number(a.link.isPrimaryContact))
  },

  async link(patientId: string, input: GuardianLinkInput, linkId?: string) {
    const data = parse<GuardianLinkInput>(guardianLinkSchema, input)
    const links = (await items("/patient-guardians", { patientId })).map(toGuardianLink)
    const existing = linkId ? links.find((l) => l.id === linkId) : undefined
    if (linkId && !existing) throw new NotFoundError("Vínculo não encontrado.")
    if (!linkId && links.some((l) => l.guardianId === data.guardianId)) {
      throw new ValidationError("Este responsável já está vinculado ao paciente.")
    }
    // A API tem no máximo um contato principal por paciente: libera o atual antes de gravar o novo.
    if (data.isPrimaryContact) {
      for (const other of links.filter((l) => l.isPrimaryContact && l.id !== linkId)) {
        await http.patch(`/patient-guardians/${seg(other.id)}`, { body: { isPrimaryContact: false } })
      }
    }
    const fields = {
      relationship: data.relationship,
      isLegalGuardian: data.isLegalGuardian,
      canSchedule: data.canSchedule,
      canReceiveDocuments: data.canReceiveDocuments,
      isPrimaryContact: data.isPrimaryContact,
    }
    if (existing && existing.guardianId === data.guardianId) {
      // `restrictions: ""` limpa o campo; `null` seria ignorado pelo COALESCE do PATCH.
      await http.patch(`/patient-guardians/${seg(existing.id)}`, { body: { ...fields, restrictions: data.restrictions } })
      return
    }
    // A API não troca o responsável de um vínculo: remove e recria (a remoção também encerra liberações ativas).
    if (existing) await http.delete(`/patient-guardians/${seg(existing.id)}`)
    await http.post("/patient-guardians", {
      body: { ...fields, patientId, guardianId: data.guardianId, restrictions: data.restrictions || undefined },
    })
  },

  async unlink(linkId: string) {
    await http.delete(`/patient-guardians/${seg(linkId)}`, { errors: { 404: "Vínculo não encontrado." } })
  },
}

// ---------------------------------------------------------------- catalog

/** Catálogo é payload JSON: cria com POST e atualiza com PATCH (merge raso), então o corpo vai sempre completo. */
async function saveCatalogItem(path: string, body: object, id: string | undefined, notFound: string) {
  if (id) return http.patch<Row>(`${path}/${seg(id)}`, { body, errors: { 404: notFound } })
  return http.post<Row>(path, { body })
}

const specialties = {
  async list() {
    return byName((await items("/specialties")).map(toSpecialty))
  },
  async save(input: SpecialtyInput, id?: string) {
    const data = parse<SpecialtyInput>(specialtySchema, input)
    await saveCatalogItem("/specialties", { ...data, status: statusOf(data.active) }, id, "Especialidade não encontrada.")
  },
}

const services = {
  async list() {
    return byName((await items("/services")).map(toService))
  },
  async save(input: ServiceInput, id?: string) {
    const data = parse<ServiceInput>(serviceSchema, input)
    const body = {
      name: data.name,
      specialtyId: data.specialtyId,
      durationMin: data.durationMin,
      referencePriceCents: Math.round(data.referencePrice * 100),
      requiresRoom: data.requiresRoom,
      active: data.active,
      status: statusOf(data.active),
    }
    await saveCatalogItem("/services", body, id, "Serviço não encontrado.")
  },
}

const rooms = {
  async list() {
    return byName((await items("/rooms")).map(toRoom))
  },
  async save(input: RoomInput, id?: string) {
    const data = parse<RoomInput>(roomSchema, input)
    await saveCatalogItem("/rooms", { ...data, status: statusOf(data.active) }, id, "Sala não encontrada.")
  },
}

// ---------------------------------------------------------------- professionals

async function listProfessionals() {
  return byName((await items("/professionals")).map(toProfessional))
}

async function getProfessional(id: string) {
  return toProfessional(await http.get<Row>(`/professionals/${seg(id)}`, { errors: { 404: "Profissional não encontrado." } }))
}

const professionals = {
  list: listProfessionals,
  get: getProfessional,
  async save(input: ProfessionalInput, id?: string): Promise<Professional> {
    const data = parse<ProfessionalInput>(professionalSchema, input)
    const fields = { ...data, status: statusOf(data.active) }
    if (id) return toProfessional(await saveCatalogItem("/professionals", fields, id, "Profissional não encontrado."))
    const colorIndex = (await listProfessionals()).length % 6
    return toProfessional(
      await saveCatalogItem(
        "/professionals",
        { ...fields, colorIndex, schedule: [], unavailabilities: [], createdAt: new Date().toISOString() },
        undefined,
        ""
      )
    )
  },
  async setSchedule(id: string, schedule: WeeklySlot[]) {
    for (const slot of schedule) parse(weeklySlotSchema, slot)
    const byDay = new Map<number, WeeklySlot[]>()
    for (const s of schedule) byDay.set(s.weekday, [...(byDay.get(s.weekday) ?? []), s])
    for (const slots of byDay.values()) {
      const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start))
      for (let i = 1; i < sorted.length; i++) {
        if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) {
          throw new ValidationError("Existem faixas de horário sobrepostas no mesmo dia.")
        }
      }
    }
    await http.put(`/professionals/${seg(id)}/schedule`, { body: { schedule }, errors: { 404: "Profissional não encontrado." } })
  },
  async addUnavailability(id: string, input: UnavailabilityInput) {
    const data = parse<UnavailabilityInput>(unavailabilitySchema, input)
    // A API só acrescenta a entrada como veio: o id é nosso, e é por ele que a remoção encontra o item.
    await http.post(`/professionals/${seg(id)}/unavailabilities`, {
      body: {
        id: uid("un"),
        start: clinicDateTimeToISO(data.date, data.startTime),
        end: clinicDateTimeToISO(data.date, data.endTime),
        reason: data.reason,
      },
      errors: { 404: "Profissional não encontrado." },
    })
  },
  async removeUnavailability(id: string, unavailabilityId: string) {
    await http.delete(`/professionals/${seg(id)}/unavailabilities/${seg(unavailabilityId)}`, {
      errors: { 404: "Profissional não encontrado." },
    })
  },
}

// ---------------------------------------------------------------- settings

async function fetchSettings() {
  return toSettings(await http.get<Row>("/settings"))
}

const settings = {
  /** A API só libera a leitura para `settings:manage`: os demais perfis usam os padrões da clínica. */
  async get() {
    return fetchSettings().catch(whenForbidden(DEFAULT_SETTINGS))
  },
  async update(input: SettingsInput) {
    const data = parse<SettingsInput>(settingsSchema, input)
    return toSettings(await http.put<Row>("/settings", { body: data }))
  },
}

// ---------------------------------------------------------------- appointments

export interface AppointmentFilters {
  from: string
  to: string
  professionalIds?: string[]
  roomId?: string
  status?: AppointmentStatus[]
  patientId?: string
}

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** Mesmo horizonte de busca de `suggestNextSlot`. */
const SUGGESTION_WINDOW_MS = 15 * DAY_MS

async function fetchAppointments(query: Record<string, string | undefined>) {
  return (await items("/appointments", query)).map((row) => toAppointment(row))
}

async function getAppointment(id: string) {
  return toAppointment(await http.get<Row>(`/appointments/${seg(id)}`, { errors: { 404: "Agendamento não encontrado." } }))
}

/** A API lista por início do atendimento: uma janela mais larga para trás pega quem começou antes e ainda sobrepõe. */
function appointmentsAround(start: string, end: string, extraMs = 0) {
  return fetchAppointments({
    from: new Date(new Date(start).getTime() - 12 * HOUR_MS).toISOString(),
    to: new Date(new Date(end).getTime() + extraMs).toISOString(),
  })
}

type BaseContext = Omit<ConflictContext, "appointments" | "ignoreLeadTime">

/**
 * Contexto das regras de agenda (grade, horário da clínica, antecedência, sala exclusiva). A API só barra
 * choque de horário, então as demais regras rodam aqui. Perfis que não leem catálogo/configurações
 * (a API restringe essas rotas) seguem sem a pré-checagem e valem as respostas do servidor.
 */
async function loadBaseContext(professionalId: string, roomId?: string): Promise<BaseContext | null> {
  const orNull = whenForbidden(null)
  const [professional, room, clinic] = await Promise.all([
    getProfessional(professionalId).catch(orNull),
    roomId ? http.get<Row>(`/rooms/${seg(roomId)}`).then(toRoom).catch(orNull) : null,
    fetchSettings().catch(orNull),
  ])
  if (!professional || !clinic) return null
  return { professional, room: room ?? undefined, settings: clinic }
}

async function suggestionFor(candidate: SlotCandidate, base: BaseContext, ignoreLeadTime = false) {
  const appointments = await appointmentsAround(candidate.start, candidate.end, SUGGESTION_WINDOW_MS)
  return suggestNextSlot(candidate, { ...base, appointments, ignoreLeadTime })
}

function validateAppointmentFields(input: AppointmentInput) {
  if (input.kind === "appointment") {
    if (!input.patientId) throw new ValidationError("Selecione o paciente.")
    if (!input.serviceId) throw new ValidationError("Selecione o serviço.")
  } else if (!input.title?.trim()) {
    throw new ValidationError("Informe o motivo do bloqueio.")
  }
}

async function validateAppointmentCatalog(input: AppointmentInput, base: BaseContext | null) {
  if (input.kind !== "appointment") return
  const patient = await getPatient(input.patientId!)
  if (patient.status !== "active") throw new ValidationError("Paciente inativo ou inexistente.")
  if (!base) return
  const service = await http
    .get<Row>(`/services/${seg(input.serviceId!)}`)
    .then(toService)
    .catch(whenForbidden(null))
  if (!service) return
  if (!service.active) throw new ValidationError("Serviço inativo ou inexistente.")
  if (!base.professional.specialtyIds.includes(service.specialtyId)) {
    throw new ValidationError(`${base.professional.name} não atende a especialidade deste serviço.`)
  }
  if (service.requiresRoom && !input.roomId) throw new ValidationError("Este serviço exige uma sala.")
}

/** RN-AGD-014: o atendimento nasce antes de acontecer; "em atendimento" e "concluído" só chegam pela máquina de estados. */
const NEW_APPOINTMENT_STATUSES: AppointmentStatus[] = ["requested", "pending", "confirmed"]

const appointments = {
  async list(filters: AppointmentFilters) {
    const { professionalIds, status } = filters
    // A API filtra por um profissional e um status; várias seleções são refinadas aqui.
    const rows = await fetchAppointments({
      from: filters.from,
      to: filters.to,
      professionalId: professionalIds?.length === 1 ? professionalIds[0] : undefined,
      status: status?.length === 1 ? status[0] : undefined,
      patientId: filters.patientId,
    })
    return rows
      .filter((a) => !professionalIds?.length || professionalIds.includes(a.professionalId))
      .filter((a) => !filters.roomId || a.roomId === filters.roomId)
      .filter((a) => !status?.length || status.includes(a.status))
      .sort((a, b) => a.start.localeCompare(b.start))
  },

  async forPatient(patientId: string) {
    const rows = await items(`/patients/${seg(patientId)}/appointments`)
    return rows.map((row) => toAppointment(row, { patientId })).sort((a, b) => b.start.localeCompare(a.start))
  },

  async check(candidate: SlotCandidate) {
    const base = await loadBaseContext(candidate.professionalId, candidate.roomId)
    if (!base) return { conflicts: [], suggestion: undefined }
    const conflicts = findConflicts(candidate, { ...base, appointments: await appointmentsAround(candidate.start, candidate.end) })
    return { conflicts, suggestion: conflicts.length ? await suggestionFor(candidate, base) : undefined }
  },

  async create(input: AppointmentInput) {
    const user = actor()
    validateAppointmentFields(input)
    const status: AppointmentStatus = input.kind === "block" ? "confirmed" : (input.status ?? "confirmed")
    if (!NEW_APPOINTMENT_STATUSES.includes(status)) {
      throw new ValidationError("Um novo agendamento só pode ser solicitado, pendente ou confirmado.")
    }
    const weeks = Math.max(1, Math.min(input.recurrenceWeeks ?? 1, 12))
    const slots = Array.from({ length: weeks }, (_, i) => ({
      start: new Date(new Date(input.start).getTime() + i * 7 * DAY_MS).toISOString(),
      end: new Date(new Date(input.end).getTime() + i * 7 * DAY_MS).toISOString(),
    }))

    const base = await loadBaseContext(input.professionalId, input.roomId)
    await validateAppointmentCatalog(input, base)

    // A API não tem recorrência: valida todas as ocorrências antes de gravar a primeira.
    if (base) {
      const planned: Appointment[] = []
      for (const [i, slot] of slots.entries()) {
        const candidate = { professionalId: input.professionalId, roomId: input.roomId, ...slot }
        const existing = await appointmentsAround(slot.start, slot.end)
        const conflicts = findConflicts(candidate, { ...base, appointments: [...existing, ...planned] })
        if (conflicts.length) {
          const label = weeks > 1 ? ` (ocorrência ${i + 1} de ${weeks})` : ""
          throw new ConflictError(`Não foi possível agendar${label}.`, conflicts, i === 0 ? await suggestionFor(candidate, base) : undefined)
        }
        planned.push({ id: `planned-${i}`, kind: input.kind, professionalId: input.professionalId, roomId: input.roomId, status, createdBy: user.id, createdAt: "", updatedAt: "", ...slot })
      }
    }

    const created: Appointment[] = []
    for (const [i, slot] of slots.entries()) {
      const draft = {
        kind: input.kind,
        title: input.kind === "block" ? input.title?.trim() : undefined,
        patientId: input.kind === "appointment" ? input.patientId : undefined,
        serviceId: input.kind === "appointment" ? input.serviceId : undefined,
        professionalId: input.professionalId,
        roomId: input.roomId || undefined,
        status,
        notes: input.notes?.trim() || undefined,
        ...slot,
      }
      try {
        const row = await http.post<Row>("/appointments", {
          body: draft,
          errors: { 409: "Não foi possível agendar: horário já ocupado ou paciente inativo." },
        })
        created.push(toAppointment(row, { ...draft, createdBy: user.id }))
      } catch (error) {
        if (error instanceof ConflictError && created.length) {
          throw new ConflictError(
            `Não foi possível agendar a ocorrência ${i + 1} de ${weeks}; ${created.length} anterior(es) já foi(ram) criada(s).`,
            error.conflicts
          )
        }
        throw error
      }
    }
    return created
  },

  /** A API só altera horário, profissional e paciente: serviço, sala e observações não são regravados. */
  async reschedule(id: string, input: AppointmentInput) {
    validateAppointmentFields(input)
    const before = await getAppointment(id)
    if (INACTIVE_STATUSES.includes(before.status) || before.status === "completed") {
      throw new ValidationError("Agendamentos encerrados não podem ser alterados.")
    }
    const candidate = { id, professionalId: input.professionalId, roomId: input.roomId, start: input.start, end: input.end }
    const base = await loadBaseContext(input.professionalId, input.roomId)
    if (base) {
      const conflicts = findConflicts(candidate, { ...base, appointments: await appointmentsAround(input.start, input.end) })
      if (conflicts.length) throw new ConflictError("Não foi possível reagendar.", conflicts, await suggestionFor(candidate, base))
    }
    const patientId = input.kind === "appointment" ? input.patientId : undefined
    // RN-AGD-015: trocar paciente ou profissional não leva o vínculo clínico junto — a API volta o confirmado para pendente.
    const reassigned = before.kind === "appointment" && (patientId !== before.patientId || input.professionalId !== before.professionalId)
    if (reassigned && before.status === "in_progress") {
      throw new ValidationError("Atendimento em curso não pode mudar de paciente ou profissional.")
    }
    await http.patch(`/appointments/${seg(id)}`, {
      body: { start: input.start, end: input.end, professionalId: input.professionalId, patientId },
      errors: { 409: "Não foi possível reagendar: horário já ocupado ou atendimento encerrado." },
    })
    return getAppointment(id)
  },

  /** O motivo do cancelamento não é gravado pela API; volta só no retorno desta chamada. */
  async changeStatus(id: string, to: AppointmentStatus, reason?: string) {
    const user = actor()
    const current = await getAppointment(id)
    if (!canUserTransition(user, current, to)) {
      throw new ForbiddenError(`Não é possível mudar de "${STATUS_LABELS[current.status]}" para "${STATUS_LABELS[to]}".`)
    }
    if (to === "cancelled" && !reason?.trim() && (await settings.get()).requireCancelReason) {
      throw new ValidationError("Informe o motivo do cancelamento.")
    }
    await http.post(`/appointments/${seg(id)}/status`, {
      body: { status: to },
      errors: { 422: `Não é possível mudar de "${STATUS_LABELS[current.status]}" para "${STATUS_LABELS[to]}".` },
    })
    const after = await getAppointment(id)
    if (to !== "cancelled") return after
    return { ...after, cancelReason: reason?.trim() || undefined, cancelledBy: user.id, cancelledAt: new Date().toISOString() }
  },
}

// ---------------------------------------------------------------- audit / dashboard

const auditLog = {
  async list(filters: { resource?: string; actorId?: string } = {}) {
    const me = useSessionStore.getState().user
    const rows = await items("/audit", {
      resource: filters.resource && filters.resource !== "all" ? fromAuditResource(filters.resource) : undefined,
      actorId: filters.actorId && filters.actorId !== "all" ? filters.actorId : undefined,
    })
    return rows.map((row, index) => toAuditEntry(row, index, (actorId) => (me?.id === actorId ? me.name : actorId)))
  },
}

/**
 * O resumo da API (`/dashboard/summary`) é por período e tem outro formato, então o painel é montado
 * aqui com a agenda da semana, os pacientes e a grade dos profissionais.
 */
const dashboard = {
  async summary() {
    const user = actor()
    const scoped = isScopedToOwnAgenda(user)

    const today = nowInClinic()
    const dayStart = startOfDay(today).getTime()
    const dayEnd = endOfDay(today).getTime()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = addDays(weekStart, 7).getTime()

    const [fetched, allPatients, allProfessionals] = await Promise.all([
      fetchAppointments({
        from: new Date(weekStart.getTime()).toISOString(),
        to: new Date(Math.max(weekEnd, Date.now() + 14 * DAY_MS)).toISOString(),
      }),
      loadPatients().catch(whenForbidden([] as Patient[])),
      listProfessionals().catch(whenForbidden([] as Professional[])),
    ])

    const visible = fetched.filter((a) => a.kind === "appointment" && canReadAppointment(user, a))
    const inRange = (a: Appointment, from: number, to: number) => {
      const t = new Date(a.start).getTime()
      return t >= from && t < to
    }
    const todays = visible.filter((a) => inRange(a, dayStart, dayEnd))
    const week = visible.filter((a) => inRange(a, weekStart.getTime(), weekEnd))

    const profs = scoped ? allProfessionals.filter((p) => p.id === user.professionalId) : allProfessionals.filter((p) => p.active)
    const occupancy = profs.map((p) => {
      const capacity = p.schedule.reduce((sum, s) => sum + toMinutes(s.end) - toMinutes(s.start), 0)
      const booked = week
        .filter((a) => a.professionalId === p.id && !INACTIVE_STATUSES.includes(a.status))
        .reduce((sum, a) => sum + (new Date(a.end).getTime() - new Date(a.start).getTime()) / 60_000, 0)
      return { professionalId: p.id, name: p.name, colorIndex: p.colorIndex, booked, capacity, rate: capacity ? Math.round((booked / capacity) * 100) : 0 }
    })

    const upcoming = visible
      .filter((a) => new Date(a.end).getTime() >= Date.now() && !INACTIVE_STATUSES.includes(a.status) && a.status !== "completed")
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 7)

    return {
      scoped,
      today: {
        total: todays.filter((a) => a.status !== "cancelled").length,
        confirmed: todays.filter((a) => a.status === "confirmed").length,
        awaiting: todays.filter((a) => a.status === "requested" || a.status === "pending").length,
        completed: todays.filter((a) => a.status === "completed").length,
        inProgress: todays.filter((a) => a.status === "in_progress").length,
      },
      week: {
        total: week.filter((a) => a.status !== "cancelled").length,
        cancelled: week.filter((a) => a.status === "cancelled").length,
        noShow: week.filter((a) => a.status === "no_show").length,
        awaiting: week.filter((a) => a.status === "requested" || a.status === "pending").length,
      },
      // A API já devolve só os pacientes do profissional; os demais perfis contam os ativos.
      activePatients: scoped ? allPatients.length : allPatients.filter((p) => p.status === "active").length,
      occupancy,
      upcoming,
    }
  },
}

export const api = {
  auth,
  patients,
  guardians,
  specialties,
  services,
  rooms,
  professionals,
  appointments,
  settings,
  audit: auditLog,
  dashboard,
  // PRN / AVA / ABA / FIN / DOC — DEMO, coleções próprias (ver demo-seed.ts)
  clinicalRecords: clinicalRecordsApi,
  assessments: assessmentsApi,
  aba: abaApi,
  financial: financialApi,
  documents: documentsApi,
}

export type { AbaPlanView } from "./demo-clinical"
export type { DocumentRow } from "./demo-documents"
export type { FinancialFilters, FinancialRow } from "./demo-financial"

export type ClinicApi = typeof api
export type DashboardSummary = Awaited<ReturnType<typeof dashboard.summary>>
export type GuardianWithPatients = Awaited<ReturnType<typeof guardians.list>>[number]
export type PatientGuardian = Awaited<ReturnType<typeof guardians.forPatient>>[number]
