import { addDays, endOfDay, startOfDay, startOfWeek } from "date-fns"

import { canUserTransition, INACTIVE_STATUSES, STATUS_LABELS } from "@/domain/appointment-status"
import { clinicDateTimeToISO, inClinic, nowInClinic, toMinutes } from "@/domain/clinic-time"
import { findPossibleDuplicates } from "@/domain/duplicate-detection"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors"
import { can, canReadAppointment, isScopedToOwnAgenda } from "@/domain/permissions"
import { findConflicts, suggestNextSlot, type SlotCandidate } from "@/domain/scheduling"
import {
  EMPTY_ATTEMPTS,
  isLocked,
  registerFailure,
  remainingLockMinutes,
  type LoginAttemptState,
} from "@/domain/login-lockout"
import {
  DEMO_PASSWORD,
  loginSchema,
  type LoginInput,
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
  type PatientInput,
  type ProfessionalInput,
  type RoomInput,
  type ServiceInput,
  type SettingsInput,
  type SpecialtyInput,
  type UnavailabilityInput,
} from "@/domain/schemas"
import type {
  Appointment,
  AppointmentStatus,
  Patient,
  PatientStatus,
  WeeklySlot,
} from "@/domain/types"
import { commit, getDB, resetDB, simulateLatency, uid } from "@/shared/lib/demo-db"

import { abaApi, assessmentsApi, clinicalRecordsApi } from "./demo-clinical"
import {
  actor,
  audit,
  blankToUndefined,
  canReadPatient,
  diff,
  now,
  ownPatientIds,
  parse,
  redactClinicalAudit,
  requirePermission,
} from "./demo-context"
import { documentsApi, revokeGuardianReleases } from "./demo-documents"
import { financialApi } from "./demo-financial"

const require = requirePermission

// ---------------------------------------------------------------- auth

const loginAttempts = new Map<string, LoginAttemptState>()

const auth = {
  async signIn(input: LoginInput) {
    await simulateLatency(350, 600)
    const parsed = loginSchema.safeParse(input)
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Dados inválidos.")
    const email = parsed.data.email
    const ts = Date.now()
    const attempts = loginAttempts.get(email) ?? EMPTY_ATTEMPTS
    if (isLocked(attempts, ts)) {
      throw new ValidationError(
        `Muitas tentativas. Tente novamente em ${remainingLockMinutes(attempts, ts)} min.`
      )
    }
    const user = getDB().users.find((u) => u.email.toLowerCase() === email)
    if (!user || parsed.data.password !== DEMO_PASSWORD) {
      const next = registerFailure(attempts, ts)
      loginAttempts.set(email, next)
      if (isLocked(next, ts)) {
        throw new ValidationError(`Acesso bloqueado por ${remainingLockMinutes(next, ts)} min após muitas tentativas.`)
      }
      throw new ValidationError("E-mail ou senha incorretos.")
    }
    loginAttempts.delete(email)
    return user
  },
  async listDemoUsers() {
    await simulateLatency(80, 160)
    return getDB().users
  },
  async me() {
    await simulateLatency(40, 80)
    return actor()
  },
  /** RF-AUTH-005: apaga todos os dados locais, então exige `settings:manage` e confirmação explícita (RN-AUTH-007). */
  async resetDemo(input: { confirm: true }) {
    await simulateLatency(80, 160)
    const user = actor()
    require(user, "settings:manage")
    if (input?.confirm !== true) throw new ValidationError("Confirme a restauração dos dados de demonstração.")
    resetDB()
    audit(user, "reset", "settings", "clinic", "Restaurou os dados de demonstração")
    commit()
  },
}

// ---------------------------------------------------------------- patients

export interface PatientFilters {
  search?: string
  status?: PatientStatus | "all"
}

const patients = {
  async list(filters: PatientFilters = {}) {
    await simulateLatency()
    const user = actor()
    if (!can(user, "patients:read") && !can(user, "patients:read-own")) throw new ForbiddenError()
    const db = getDB()
    const scope = can(user, "patients:read") ? null : ownPatientIds(user)
    const q = filters.search?.trim().toLowerCase()
    return db.patients
      .filter((p) => !scope || scope.has(p.id))
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

  async get(id: string) {
    await simulateLatency()
    const user = actor()
    const patient = getDB().patients.find((p) => p.id === id)
    if (!patient) throw new NotFoundError("Paciente não encontrado.")
    if (!canReadPatient(user, id)) throw new ForbiddenError("Você não tem acesso a este paciente.")
    return patient
  },

  async checkDuplicates(input: { fullName: string; birthDate?: string; document?: string; id?: string }) {
    const user = actor()
    require(user, "patients:write")
    return findPossibleDuplicates(input, getDB().patients)
  },

  async create(input: PatientInput) {
    await simulateLatency()
    const user = actor()
    require(user, "patients:write")
    const data = blankToUndefined(parse<PatientInput>(patientSchema, input))
    const db = getDB()
    if (data.document && db.patients.some((p) => p.document?.replace(/\D/g, "") === data.document?.replace(/\D/g, ""))) {
      throw new ValidationError("Já existe um paciente com este CPF.")
    }
    db.counters.patient += 1
    const patient: Patient = {
      ...data,
      id: uid("pa"),
      code: `PAC-${String(db.counters.patient).padStart(4, "0")}`,
      createdAt: now(),
      updatedAt: now(),
    }
    db.patients.push(patient)
    audit(user, "create", "patient", patient.id, `Cadastrou o paciente ${patient.fullName}`)
    commit()
    return patient
  },

  async update(id: string, input: PatientInput) {
    await simulateLatency()
    const user = actor()
    require(user, "patients:write")
    const data = blankToUndefined(parse<PatientInput>(patientSchema, input))
    const db = getDB()
    const index = db.patients.findIndex((p) => p.id === id)
    if (index < 0) throw new NotFoundError("Paciente não encontrado.")
    const before = db.patients[index]
    const after: Patient = { ...before, ...data, updatedAt: now() }
    db.patients[index] = after
    audit(user, "update", "patient", id, `Atualizou o cadastro de ${after.fullName}`, diff(before, after))
    commit()
    return after
  },
}

// ---------------------------------------------------------------- guardians

const guardians = {
  async list(search?: string) {
    await simulateLatency()
    const user = actor()
    require(user, "patients:read")
    const db = getDB()
    const q = search?.trim().toLowerCase()
    return db.guardians
      .filter((g) => !q || g.fullName.toLowerCase().includes(q) || g.phone.includes(q))
      .map((g) => ({
        guardian: g,
        patients: db.links
          .filter((l) => l.guardianId === g.id)
          .map((l) => ({ link: l, patient: db.patients.find((p) => p.id === l.patientId)! }))
          .filter((x) => x.patient),
      }))
      .sort((a, b) => a.guardian.fullName.localeCompare(b.guardian.fullName, "pt-BR"))
  },

  async create(input: GuardianInput) {
    await simulateLatency()
    const user = actor()
    require(user, "guardians:write")
    const data = blankToUndefined(parse<GuardianInput>(guardianSchema, input))
    const guardian = { ...data, id: uid("gu"), createdAt: now() }
    getDB().guardians.push(guardian)
    audit(user, "create", "guardian", guardian.id, `Cadastrou o responsável ${guardian.fullName}`)
    commit()
    return guardian
  },

  async update(id: string, input: GuardianInput) {
    await simulateLatency()
    const user = actor()
    require(user, "guardians:write")
    const data = blankToUndefined(parse<GuardianInput>(guardianSchema, input))
    const db = getDB()
    const index = db.guardians.findIndex((g) => g.id === id)
    if (index < 0) throw new NotFoundError("Responsável não encontrado.")
    const before = db.guardians[index]
    const after = { ...before, ...data }
    db.guardians[index] = after
    audit(user, "update", "guardian", id, `Atualizou o responsável ${after.fullName}`, diff(before, after))
    commit()
    return after
  },

  async forPatient(patientId: string) {
    await simulateLatency()
    const user = actor()
    if (!canReadPatient(user, patientId)) throw new ForbiddenError()
    const db = getDB()
    return db.links
      .filter((l) => l.patientId === patientId)
      .map((link) => ({ link, guardian: db.guardians.find((g) => g.id === link.guardianId)! }))
      .filter((x) => x.guardian)
      .sort((a, b) => Number(b.link.isPrimaryContact) - Number(a.link.isPrimaryContact))
  },

  async link(patientId: string, input: GuardianLinkInput, linkId?: string) {
    await simulateLatency()
    const user = actor()
    require(user, "guardians:write")
    const data = parse<GuardianLinkInput>(guardianLinkSchema, input)
    const db = getDB()
    const patient = db.patients.find((p) => p.id === patientId)
    const guardian = db.guardians.find((g) => g.id === data.guardianId)
    if (!patient || !guardian) throw new NotFoundError("Paciente ou responsável não encontrado.")
    if (!linkId && db.links.some((l) => l.patientId === patientId && l.guardianId === data.guardianId)) {
      throw new ValidationError("Este responsável já está vinculado ao paciente.")
    }
    if (data.isPrimaryContact) {
      for (const l of db.links) if (l.patientId === patientId && l.id !== linkId) l.isPrimaryContact = false
    }
    const payload = { ...data, restrictions: data.restrictions || undefined }
    if (linkId) {
      const index = db.links.findIndex((l) => l.id === linkId)
      if (index < 0) throw new NotFoundError("Vínculo não encontrado.")
      const before = db.links[index]
      db.links[index] = { ...before, ...payload }
      audit(user, "update", "guardian_link", linkId, `Atualizou o vínculo de ${guardian.fullName} com ${patient.fullName}`, diff(before, db.links[index]))
      // RN-DOC-009: trocar o responsável do vínculo ou retirar `canReceiveDocuments` encerra as liberações ativas.
      if (db.links[index].guardianId !== before.guardianId || !db.links[index].canReceiveDocuments) {
        revokeGuardianReleases(before.patientId, before.guardianId, "Autorização do responsável para receber documentos encerrada", user, now())
      }
    } else {
      db.links.push({ ...payload, id: uid("ln"), patientId })
      audit(user, "create", "guardian_link", patientId, `Vinculou ${guardian.fullName} a ${patient.fullName}`)
    }
    commit()
  },

  async unlink(linkId: string) {
    await simulateLatency()
    const user = actor()
    require(user, "guardians:write")
    const db = getDB()
    const link = db.links.find((l) => l.id === linkId)
    if (!link) throw new NotFoundError("Vínculo não encontrado.")
    db.links = db.links.filter((l) => l.id !== linkId)
    audit(user, "delete", "guardian_link", link.patientId, "Removeu vínculo de responsável")
    // RN-DOC-009: sem vínculo não há liberação ativa; o histórico das liberações permanece.
    revokeGuardianReleases(link.patientId, link.guardianId, "Vínculo do responsável com o paciente removido", user, now())
    commit()
  },
}

// ---------------------------------------------------------------- catalog

const specialties = {
  async list() {
    await simulateLatency(100, 200)
    actor()
    return getDB().specialties
  },
  async save(input: SpecialtyInput, id?: string) {
    await simulateLatency()
    const user = actor()
    require(user, "services:manage")
    const data = parse<SpecialtyInput>(specialtySchema, input)
    const db = getDB()
    if (id) {
      const index = db.specialties.findIndex((s) => s.id === id)
      const before = db.specialties[index]
      db.specialties[index] = { ...before, ...data, description: data.description || undefined }
      audit(user, "update", "specialty", id, `Atualizou a especialidade ${data.name}`, diff(before, db.specialties[index]))
    } else {
      const created = { ...data, description: data.description || undefined, id: uid("sp") }
      db.specialties.push(created)
      audit(user, "create", "specialty", created.id, `Criou a especialidade ${data.name}`)
    }
    commit()
  },
}

const services = {
  async list() {
    await simulateLatency(100, 200)
    actor()
    return getDB().services
  },
  async save(input: ServiceInput, id?: string) {
    await simulateLatency()
    const user = actor()
    require(user, "services:manage")
    const data = parse<ServiceInput>(serviceSchema, input)
    const db = getDB()
    const record = {
      name: data.name,
      specialtyId: data.specialtyId,
      durationMin: data.durationMin,
      referencePriceCents: Math.round(data.referencePrice * 100),
      requiresRoom: data.requiresRoom,
      active: data.active,
    }
    if (id) {
      const index = db.services.findIndex((s) => s.id === id)
      const before = db.services[index]
      db.services[index] = { ...before, ...record }
      audit(user, "update", "service", id, `Atualizou o serviço ${data.name}`, diff(before, db.services[index]))
    } else {
      const created = { ...record, id: uid("sv") }
      db.services.push(created)
      audit(user, "create", "service", created.id, `Criou o serviço ${data.name}`)
    }
    commit()
  },
}

const rooms = {
  async list() {
    await simulateLatency(100, 200)
    actor()
    return getDB().rooms
  },
  async save(input: RoomInput, id?: string) {
    await simulateLatency()
    const user = actor()
    require(user, "rooms:manage")
    const data = parse<RoomInput>(roomSchema, input)
    const db = getDB()
    const record = { ...data, notes: data.notes || undefined }
    if (id) {
      const index = db.rooms.findIndex((r) => r.id === id)
      const before = db.rooms[index]
      db.rooms[index] = { ...before, ...record }
      audit(user, "update", "room", id, `Atualizou a sala ${data.name}`, diff(before, db.rooms[index]))
    } else {
      const created = { ...record, id: uid("rm") }
      db.rooms.push(created)
      audit(user, "create", "room", created.id, `Criou a sala ${data.name}`)
    }
    commit()
  },
}

// ---------------------------------------------------------------- professionals

const professionals = {
  async list() {
    await simulateLatency(120, 240)
    actor()
    return getDB().professionals
  },
  async get(id: string) {
    await simulateLatency()
    actor()
    const prof = getDB().professionals.find((p) => p.id === id)
    if (!prof) throw new NotFoundError("Profissional não encontrado.")
    return prof
  },
  async save(input: ProfessionalInput, id?: string) {
    await simulateLatency()
    const user = actor()
    require(user, "professionals:manage")
    const data = blankToUndefined(parse<ProfessionalInput>(professionalSchema, input))
    const db = getDB()
    if (id) {
      const index = db.professionals.findIndex((p) => p.id === id)
      if (index < 0) throw new NotFoundError("Profissional não encontrado.")
      const before = db.professionals[index]
      db.professionals[index] = { ...before, ...data }
      audit(user, "update", "professional", id, `Atualizou o profissional ${data.name}`, diff(before, db.professionals[index]))
      commit()
      return db.professionals[index]
    }
    const created = {
      ...data,
      id: uid("pr"),
      colorIndex: db.professionals.length % 6,
      schedule: [],
      unavailabilities: [],
      createdAt: now(),
    }
    db.professionals.push(created)
    audit(user, "create", "professional", created.id, `Cadastrou o profissional ${data.name}`)
    commit()
    return created
  },
  async setSchedule(id: string, schedule: WeeklySlot[]) {
    await simulateLatency()
    const user = actor()
    require(user, "professionals:manage")
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
    const db = getDB()
    const prof = db.professionals.find((p) => p.id === id)
    if (!prof) throw new NotFoundError("Profissional não encontrado.")
    const before = prof.schedule
    prof.schedule = schedule
    audit(user, "update", "professional", id, `Atualizou a grade de ${prof.name}`, { schedule: { from: before, to: schedule } })
    commit()
  },
  async addUnavailability(id: string, input: UnavailabilityInput) {
    await simulateLatency()
    const user = actor()
    require(user, "professionals:manage")
    const data = parse<UnavailabilityInput>(unavailabilitySchema, input)
    const db = getDB()
    const prof = db.professionals.find((p) => p.id === id)
    if (!prof) throw new NotFoundError("Profissional não encontrado.")
    prof.unavailabilities.push({
      id: uid("un"),
      start: clinicDateTimeToISO(data.date, data.startTime),
      end: clinicDateTimeToISO(data.date, data.endTime),
      reason: data.reason,
    })
    audit(user, "create", "unavailability", id, `Registrou indisponibilidade de ${prof.name}: ${data.reason}`)
    commit()
  },
  async removeUnavailability(id: string, unavailabilityId: string) {
    await simulateLatency()
    const user = actor()
    require(user, "professionals:manage")
    const prof = getDB().professionals.find((p) => p.id === id)
    if (!prof) throw new NotFoundError("Profissional não encontrado.")
    prof.unavailabilities = prof.unavailabilities.filter((u) => u.id !== unavailabilityId)
    audit(user, "delete", "unavailability", id, `Removeu indisponibilidade de ${prof.name}`)
    commit()
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

function conflictContext(candidate: SlotCandidate, ignoreLeadTime = false) {
  const db = getDB()
  const professional = db.professionals.find((p) => p.id === candidate.professionalId)
  if (!professional) throw new NotFoundError("Profissional não encontrado.")
  return {
    appointments: db.appointments,
    professional,
    room: db.rooms.find((r) => r.id === candidate.roomId),
    settings: db.settings,
    ignoreLeadTime,
  }
}

function validateAppointment(input: AppointmentInput) {
  const db = getDB()
  if (input.kind === "appointment") {
    if (!input.patientId) throw new ValidationError("Selecione o paciente.")
    if (!input.serviceId) throw new ValidationError("Selecione o serviço.")
    const patient = db.patients.find((p) => p.id === input.patientId)
    if (!patient || patient.status !== "active") throw new ValidationError("Paciente inativo ou inexistente.")
    const service = db.services.find((s) => s.id === input.serviceId)
    if (!service || !service.active) throw new ValidationError("Serviço inativo ou inexistente.")
    const prof = db.professionals.find((p) => p.id === input.professionalId)
    if (prof && !prof.specialtyIds.includes(service.specialtyId)) {
      throw new ValidationError(`${prof.name} não atende a especialidade deste serviço.`)
    }
    if (service.requiresRoom && !input.roomId) throw new ValidationError("Este serviço exige uma sala.")
  } else if (!input.title?.trim()) {
    throw new ValidationError("Informe o motivo do bloqueio.")
  }
}

/** RN-AGD-014: o atendimento nasce antes de acontecer; "em atendimento" e "concluído" só chegam pela máquina de estados. */
const NEW_APPOINTMENT_STATUSES: AppointmentStatus[] = ["requested", "pending", "confirmed"]

function describeAppointment(a: Pick<Appointment, "kind" | "patientId" | "title" | "start">) {
  const db = getDB()
  const when = inClinic(a.start).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
  if (a.kind === "block") return `bloqueio "${a.title}" em ${when}`
  const patient = db.patients.find((p) => p.id === a.patientId)
  return `atendimento de ${patient?.fullName ?? "paciente"} em ${when}`
}

const appointments = {
  async list(filters: AppointmentFilters) {
    await simulateLatency()
    const user = actor()
    if (!can(user, "appointments:read") && !can(user, "appointments:read-own")) throw new ForbiddenError()
    const from = new Date(filters.from).getTime()
    const to = new Date(filters.to).getTime()
    return getDB()
      .appointments.filter((a) => canReadAppointment(user, a))
      .filter((a) => new Date(a.start).getTime() < to && new Date(a.end).getTime() > from)
      .filter((a) => !filters.professionalIds?.length || filters.professionalIds.includes(a.professionalId))
      .filter((a) => !filters.roomId || a.roomId === filters.roomId)
      .filter((a) => !filters.status?.length || filters.status.includes(a.status))
      .filter((a) => !filters.patientId || a.patientId === filters.patientId)
      .sort((a, b) => a.start.localeCompare(b.start))
  },

  async forPatient(patientId: string) {
    await simulateLatency()
    const user = actor()
    if (!canReadPatient(user, patientId)) throw new ForbiddenError()
    return getDB()
      .appointments.filter((a) => a.patientId === patientId && canReadAppointment(user, a))
      .sort((a, b) => b.start.localeCompare(a.start))
  },

  async check(candidate: SlotCandidate) {
    const ctx = conflictContext(candidate)
    const conflicts = findConflicts(candidate, ctx)
    return {
      conflicts,
      suggestion: conflicts.length ? suggestNextSlot(candidate, ctx) : undefined,
    }
  },

  async create(input: AppointmentInput) {
    await simulateLatency()
    const user = actor()
    require(user, "appointments:write")
    validateAppointment(input)
    const status: AppointmentStatus = input.kind === "block" ? "confirmed" : (input.status ?? "confirmed")
    if (!NEW_APPOINTMENT_STATUSES.includes(status)) {
      throw new ValidationError("Um novo agendamento só pode ser solicitado, pendente ou confirmado.")
    }
    const db = getDB()
    const weeks = Math.max(1, Math.min(input.recurrenceWeeks ?? 1, 12))
    const groupId = weeks > 1 ? uid("rec") : undefined
    const created: Appointment[] = []

    for (let i = 0; i < weeks; i++) {
      const offset = i * 7 * 24 * 3600_000
      const start = new Date(new Date(input.start).getTime() + offset).toISOString()
      const end = new Date(new Date(input.end).getTime() + offset).toISOString()
      const candidate = { professionalId: input.professionalId, roomId: input.roomId, start, end }
      const ctx = conflictContext(candidate)
      const conflicts = findConflicts(candidate, { ...ctx, appointments: [...db.appointments, ...created] })
      if (conflicts.length) {
        const label = weeks > 1 ? ` (ocorrência ${i + 1} de ${weeks})` : ""
        throw new ConflictError(`Não foi possível agendar${label}.`, conflicts, i === 0 ? suggestNextSlot(candidate, ctx) : undefined)
      }
      created.push({
        id: uid("ap"),
        kind: input.kind,
        title: input.kind === "block" ? input.title?.trim() : undefined,
        patientId: input.kind === "appointment" ? input.patientId : undefined,
        serviceId: input.kind === "appointment" ? input.serviceId : undefined,
        professionalId: input.professionalId,
        roomId: input.roomId || undefined,
        start,
        end,
        status,
        notes: input.notes?.trim() || undefined,
        recurrenceGroupId: groupId,
        createdBy: user.id,
        createdAt: now(),
        updatedAt: now(),
      })
    }

    db.appointments.push(...created)
    const suffix = weeks > 1 ? ` (${weeks} ocorrências semanais)` : ""
    audit(user, "create", "appointment", created[0].id, `Agendou ${describeAppointment(created[0])}${suffix}`)
    commit()
    return created
  },

  async reschedule(id: string, input: AppointmentInput) {
    await simulateLatency()
    const user = actor()
    require(user, "appointments:write")
    validateAppointment(input)
    const db = getDB()
    const index = db.appointments.findIndex((a) => a.id === id)
    if (index < 0) throw new NotFoundError("Agendamento não encontrado.")
    const before = db.appointments[index]
    if (INACTIVE_STATUSES.includes(before.status) || before.status === "completed") {
      throw new ValidationError("Agendamentos encerrados não podem ser alterados.")
    }
    const candidate = { id, professionalId: input.professionalId, roomId: input.roomId, start: input.start, end: input.end }
    const ctx = conflictContext(candidate)
    const conflicts = findConflicts(candidate, ctx)
    if (conflicts.length) throw new ConflictError("Não foi possível reagendar.", conflicts, suggestNextSlot(candidate, ctx))
    const patientId = input.kind === "appointment" ? input.patientId : undefined
    // RN-AGD-015: trocar paciente ou profissional não leva o vínculo clínico junto — exige nova confirmação.
    const reassigned = before.kind === "appointment" && (patientId !== before.patientId || input.professionalId !== before.professionalId)
    if (reassigned && before.status === "in_progress") {
      throw new ValidationError("Atendimento em curso não pode mudar de paciente ou profissional.")
    }
    const after: Appointment = {
      ...before,
      title: input.kind === "block" ? input.title?.trim() : undefined,
      patientId,
      serviceId: input.kind === "appointment" ? input.serviceId : undefined,
      professionalId: input.professionalId,
      roomId: input.roomId || undefined,
      start: input.start,
      end: input.end,
      status: reassigned && before.status === "confirmed" ? "pending" : before.status,
      notes: input.notes?.trim() || undefined,
      updatedAt: now(),
    }
    db.appointments[index] = after
    audit(user, "update", "appointment", id, `Alterou ${describeAppointment(after)}`, diff(before, after))
    commit()
    return after
  },

  async changeStatus(id: string, to: AppointmentStatus, reason?: string) {
    await simulateLatency()
    const user = actor()
    const db = getDB()
    const appt = db.appointments.find((a) => a.id === id)
    if (!appt) throw new NotFoundError("Agendamento não encontrado.")
    if (!canUserTransition(user, appt, to)) {
      throw new ForbiddenError(`Não é possível mudar de "${STATUS_LABELS[appt.status]}" para "${STATUS_LABELS[to]}".`)
    }
    if (to === "cancelled" && db.settings.requireCancelReason && !reason?.trim()) {
      throw new ValidationError("Informe o motivo do cancelamento.")
    }
    const from = appt.status
    appt.status = to
    appt.updatedAt = now()
    if (to === "cancelled") {
      appt.cancelReason = reason?.trim()
      appt.cancelledBy = user.id
      appt.cancelledAt = now()
    }
    audit(
      user,
      "status_change",
      "appointment",
      id,
      `${STATUS_LABELS[to]}: ${describeAppointment(appt)}${reason ? ` — ${reason}` : ""}`,
      { status: { from, to } }
    )
    commit()
    return appt
  },
}

// ---------------------------------------------------------------- settings / audit / dashboard

const settings = {
  async get() {
    await simulateLatency(100, 200)
    actor()
    return getDB().settings
  },
  async update(input: SettingsInput) {
    await simulateLatency()
    const user = actor()
    require(user, "settings:manage")
    const data = parse<SettingsInput>(settingsSchema, input)
    const db = getDB()
    const before = db.settings
    db.settings = data
    audit(user, "update", "settings", "clinic", "Atualizou as configurações da clínica", diff(before, data))
    commit()
    return data
  },
}

const auditLog = {
  async list(filters: { resource?: string; actorId?: string } = {}) {
    await simulateLatency()
    const user = actor()
    require(user, "audit:read")
    return getDB()
      .audit.filter((e) => !filters.resource || filters.resource === "all" || e.resource === filters.resource)
      .filter((e) => !filters.actorId || filters.actorId === "all" || e.actorId === filters.actorId)
      .map(redactClinicalAudit)
  },
}

const dashboard = {
  async summary() {
    await simulateLatency()
    const user = actor()
    const db = getDB()
    const scoped = isScopedToOwnAgenda(user)
    const visible = db.appointments.filter(
      (a) => a.kind === "appointment" && canReadAppointment(user, a)
    )

    const today = nowInClinic()
    const dayStart = startOfDay(today).getTime()
    const dayEnd = endOfDay(today).getTime()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = addDays(weekStart, 7).getTime()
    const inRange = (a: Appointment, from: number, to: number) => {
      const t = new Date(a.start).getTime()
      return t >= from && t < to
    }

    const todays = visible.filter((a) => inRange(a, dayStart, dayEnd))
    const week = visible.filter((a) => inRange(a, weekStart.getTime(), weekEnd))

    const profs = scoped ? db.professionals.filter((p) => p.id === user.professionalId) : db.professionals.filter((p) => p.active)
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
      activePatients: scoped ? ownPatientIds(user).size : db.patients.filter((p) => p.status === "active").length,
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
