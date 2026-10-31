import { ROLE_LABELS } from "@/domain/permissions"
import type {
  Appointment,
  AppointmentStatus,
  AuditEntry,
  BusinessDay,
  ClinicSettings,
  Guardian,
  Patient,
  PatientGuardianLink,
  PatientStatus,
  Professional,
  Role,
  Room,
  Service,
  Specialty,
  Unavailability,
  User,
  WeeklySlot,
} from "@/domain/types"

/**
 * Tradução das linhas da API Hono para os tipos de `domain/types`. As linhas chegam em formatos
 * diferentes conforme a rota (camelCase com alias, `SELECT *` em snake_case, payload JSON do catálogo),
 * então cada mapper lê os dois nomes e converte `null` em ausência.
 */
export type Row = Record<string, unknown>

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value)

/** Texto opcional: `null`, vazio e tipos errados viram `undefined`. */
const optional = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined)
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : value == null ? fallback : String(value))
const flag = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback)
const count = (value: unknown, fallback = 0) => {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}
const timestamp = (value: unknown) => (value instanceof Date ? value.toISOString() : typeof value === "string" ? value : "")
const either = (row: Row, camel: string, snake: string) => row[camel] ?? row[snake]

export function toUser(raw: Row): User {
  const roles = (Array.isArray(raw.roles) ? raw.roles : []).filter((r): r is Role => typeof r === "string" && r in ROLE_LABELS)
  return {
    id: text(raw.id),
    name: text(raw.name),
    email: text(raw.email),
    title: roles[0] ? ROLE_LABELS[roles[0]] : "",
    roles,
    professionalId: optional(raw.professionalId),
  }
}

// ---------------------------------------------------------------- pacientes

/** `list` devolve o código bruto (`7`), `create` já devolve `PAC-0007`. */
export const patientCode = (value: unknown) => {
  const raw = text(value)
  return /^\d+$/.test(raw) ? `PAC-${raw.padStart(4, "0")}` : raw
}

export function toPatient(raw: Row): Patient {
  const createdAt = timestamp(raw.createdAt)
  return {
    id: text(raw.id),
    code: patientCode(raw.code),
    fullName: text(raw.fullName),
    socialName: optional(raw.socialName),
    // A coluna é `date`: o driver serializa como ISO e a data civil são os 10 primeiros caracteres.
    birthDate: timestamp(raw.birthDate).slice(0, 10),
    document: optional(raw.document),
    phone: optional(raw.phone),
    email: optional(raw.email),
    address: optional(raw.address),
    status: (optional(raw.status) as PatientStatus | undefined) ?? "active",
    mainProfessionalId: optional(raw.mainProfessionalId),
    consentData: flag(raw.consentData),
    consentImage: flag(raw.consentImage),
    administrativeNotes: optional(raw.administrativeNotes),
    createdAt,
    updatedAt: timestamp(raw.updatedAt) || createdAt,
  }
}

export function toGuardian(raw: Row): Guardian {
  return {
    id: text(raw.id),
    fullName: text(either(raw, "fullName", "full_name")),
    document: optional(raw.document),
    phone: text(raw.phone),
    email: optional(raw.email),
    createdAt: timestamp(either(raw, "createdAt", "created_at")),
  }
}

export function toGuardianLink(raw: Row): PatientGuardianLink {
  return {
    id: text(raw.id),
    patientId: text(either(raw, "patientId", "patient_id")),
    guardianId: text(either(raw, "guardianId", "guardian_id")),
    relationship: text(raw.relationship),
    isLegalGuardian: flag(either(raw, "isLegalGuardian", "is_legal_guardian")),
    canSchedule: flag(either(raw, "canSchedule", "can_schedule")),
    canReceiveDocuments: flag(either(raw, "canReceiveDocuments", "can_receive_documents")),
    isPrimaryContact: flag(either(raw, "isPrimaryContact", "is_primary_contact")),
    restrictions: optional(raw.restrictions),
  }
}

// ---------------------------------------------------------------- catálogo (payload JSON em `api_resources`)

export function toSpecialty(raw: Row): Specialty {
  return {
    id: text(raw.id),
    name: text(raw.name),
    description: optional(raw.description),
    active: flag(raw.active, true),
  }
}

export function toService(raw: Row): Service {
  return {
    id: text(raw.id),
    name: text(raw.name),
    specialtyId: text(raw.specialtyId),
    durationMin: count(raw.durationMin, 50),
    referencePriceCents: count(raw.referencePriceCents),
    requiresRoom: flag(raw.requiresRoom),
    active: flag(raw.active, true),
  }
}

export function toRoom(raw: Row): Room {
  return {
    id: text(raw.id),
    name: text(raw.name),
    capacity: count(raw.capacity, 1),
    exclusive: flag(raw.exclusive),
    active: flag(raw.active, true),
    notes: optional(raw.notes),
  }
}

const listOf = (value: unknown) => (Array.isArray(value) ? value.filter(isRow) : [])

export function toProfessional(raw: Row): Professional {
  return {
    id: text(raw.id),
    name: text(raw.name),
    email: text(raw.email),
    phone: optional(raw.phone),
    registry: optional(raw.registry),
    specialtyIds: (Array.isArray(raw.specialtyIds) ? raw.specialtyIds : []).filter((id): id is string => typeof id === "string"),
    active: flag(raw.active, true),
    colorIndex: count(raw.colorIndex),
    schedule: listOf(raw.schedule).map(
      (slot): WeeklySlot => ({ weekday: count(slot.weekday), start: text(slot.start), end: text(slot.end) })
    ),
    unavailabilities: listOf(raw.unavailabilities).map(
      (u): Unavailability => ({ id: text(u.id), start: text(u.start), end: text(u.end), reason: text(u.reason) })
    ),
    createdAt: timestamp(raw.createdAt),
  }
}

// ---------------------------------------------------------------- agenda

/**
 * `base` completa o que a rota não devolve (o POST só retorna alguns campos; a listagem por paciente
 * omite `patientId`). Colunas que a API não expõe ficam vazias.
 */
export function toAppointment(raw: Row, base: Partial<Appointment> = {}): Appointment {
  const createdAt = timestamp(either(raw, "createdAt", "created_at"))
  return {
    id: text(raw.id),
    kind: (optional(raw.kind) ?? base.kind) === "block" ? "block" : "appointment",
    title: optional(raw.title) ?? base.title,
    patientId: optional(either(raw, "patientId", "patient_id")) ?? base.patientId,
    serviceId: optional(either(raw, "serviceId", "service_id")) ?? base.serviceId,
    professionalId: text(either(raw, "professionalId", "professional_id") ?? base.professionalId),
    roomId: optional(either(raw, "roomId", "room_id")) ?? base.roomId,
    start: timestamp(either(raw, "start", "starts_at")) || base.start || "",
    end: timestamp(either(raw, "end", "ends_at")) || base.end || "",
    status: (optional(raw.status) as AppointmentStatus | undefined) ?? base.status ?? "confirmed",
    notes: optional(raw.notes) ?? base.notes,
    recurrenceGroupId: base.recurrenceGroupId,
    cancelReason: optional(either(raw, "cancelReason", "cancel_reason")) ?? base.cancelReason,
    cancelledBy: base.cancelledBy,
    cancelledAt: base.cancelledAt,
    createdBy: text(either(raw, "createdBy", "created_by") ?? base.createdBy),
    createdAt,
    updatedAt: timestamp(either(raw, "updatedAt", "updated_at")) || createdAt,
  }
}

// ---------------------------------------------------------------- configurações e auditoria

/** Segunda a sexta abertos; sábado e domingo fechados. */
const weekdayHours = (open: string, close: string): BusinessDay[] =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open, close, closed: weekday === 0 || weekday === 6 }))

/** Usado quando a clínica ainda não salvou configurações (a API devolve `{}`). */
export const DEFAULT_SETTINGS: ClinicSettings = {
  name: "",
  legalName: "",
  document: "",
  phone: "",
  email: "",
  address: "",
  businessHours: weekdayHours("08:00", "18:00"),
  minLeadMinutes: 60,
  lateToleranceMinutes: 15,
  rescheduleWindowHours: 24,
  requireCancelReason: true,
}

export function toSettings(raw: Row): ClinicSettings {
  const d = DEFAULT_SETTINGS
  const hours = listOf(raw.businessHours).map(
    (day): BusinessDay => ({ weekday: count(day.weekday), open: text(day.open), close: text(day.close), closed: flag(day.closed) })
  )
  return {
    name: text(raw.name, d.name),
    legalName: text(raw.legalName, d.legalName),
    document: text(raw.document, d.document),
    phone: text(raw.phone, d.phone),
    email: text(raw.email, d.email),
    address: text(raw.address, d.address),
    businessHours: hours.length ? hours : d.businessHours,
    minLeadMinutes: count(raw.minLeadMinutes, d.minLeadMinutes),
    lateToleranceMinutes: count(raw.lateToleranceMinutes, d.lateToleranceMinutes),
    rescheduleWindowHours: count(raw.rescheduleWindowHours, d.rescheduleWindowHours),
    requireCancelReason: flag(raw.requireCancelReason, d.requireCancelReason),
  }
}

/** A API usa `clinical-record`; a UI e o restante do domínio usam `clinical_record`. */
export const toAuditResource = (resource: string) => resource.replaceAll("-", "_")
export const fromAuditResource = (resource: string) => resource.replaceAll("_", "-")

/**
 * A API não devolve `id` nem o nome do ator, e `changes` traz só os campos alterados (sem valores).
 * O id sintético é estável para a mesma resposta; o nome cai no id quando o ator não é o usuário atual.
 */
export function toAuditEntry(raw: Row, index: number, actorName: (actorId: string) => string): AuditEntry {
  const at = timestamp(raw.at)
  const resource = toAuditResource(text(raw.resource))
  const resourceId = text(either(raw, "resourceId", "resource_id"))
  const actorId = text(raw.actorId)
  const changes = listOf(raw.changes).filter((c) => typeof c.field === "string")
  return {
    id: `${at}|${resource}|${resourceId}|${index}`,
    at,
    actorId,
    actorName: actorName(actorId),
    action: text(raw.action),
    resource,
    resourceId,
    summary: text(raw.summary),
    changes: changes.length
      ? Object.fromEntries(changes.map((c) => [c.field as string, { from: c.from ?? null, to: c.to ?? null }]))
      : undefined,
  }
}
