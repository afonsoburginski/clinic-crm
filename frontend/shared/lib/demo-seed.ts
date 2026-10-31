import { addDays, startOfWeek } from "date-fns"

import { STATUS_LABELS } from "@/domain/appointment-status"
import { clinicDateTimeToISO, clinicDateKey, nowInClinic } from "@/domain/clinic-time"
import type {
  AbaPlan,
  AbaSession,
  Appointment,
  AppointmentStatus,
  Assessment,
  AuditEntry,
  ClinicalRecord,
  ClinicSettings,
  FinancialEntry,
  FinancialPayment,
  Guardian,
  Patient,
  PatientDocument,
  PatientGuardianLink,
  Professional,
  Room,
  Service,
  Specialty,
  User,
} from "@/domain/types"

/**
 * Coleções clínicas, financeiras e de documentos ficam separadas das demais e
 * entre si (RN-AUTH-002, RN-FIN-009). Nascem vazias: não há seed clínico nem
 * financeiro, para que nada demonstrativo seja confundido com dado real.
 */
export interface DemoModulesDB {
  clinicalRecords: ClinicalRecord[]
  assessments: Assessment[]
  abaPlans: AbaPlan[]
  abaSessions: AbaSession[]
  financialEntries: FinancialEntry[]
  financialPayments: FinancialPayment[]
  documents: PatientDocument[]
}

export interface DemoDB extends DemoModulesDB {
  version: number
  users: User[]
  specialties: Specialty[]
  services: Service[]
  rooms: Room[]
  professionals: Professional[]
  patients: Patient[]
  guardians: Guardian[]
  links: PatientGuardianLink[]
  appointments: Appointment[]
  settings: ClinicSettings
  audit: AuditEntry[]
  counters: { patient: number; financial: number }
}

export const DB_VERSION = 1

export function emptyModules(): DemoModulesDB {
  return {
    clinicalRecords: [],
    assessments: [],
    abaPlans: [],
    abaSessions: [],
    financialEntries: [],
    financialPayments: [],
    documents: [],
  }
}

/** Completa bancos salvos antes dos módulos novos, sem apagar dados locais. */
export function withModuleDefaults(db: DemoDB): DemoDB {
  // `financial` não existe em bancos salvos antes deste módulo, apesar do tipo.
  return { ...emptyModules(), ...db, counters: { ...db.counters, financial: db.counters.financial ?? 0 } }
}

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const weekdays = (start: string, end: string, days = [1, 2, 3, 4, 5]) =>
  days.map((weekday) => ({ weekday, start, end }))

export function createSeed(): DemoDB {
  const createdAt = new Date().toISOString()
  const random = rng(42)

  const specialties: Specialty[] = [
    { id: "sp-psi", name: "Psicologia infantil", description: "Psicoterapia e orientação parental", active: true },
    { id: "sp-neuro", name: "Neuropsicologia", description: "Avaliação e reabilitação cognitiva", active: true },
    { id: "sp-aba", name: "Análise do Comportamento (ABA)", description: "Intervenção comportamental", active: true },
    { id: "sp-fono", name: "Fonoaudiologia", description: "Linguagem, fala e comunicação", active: true },
    { id: "sp-to", name: "Terapia Ocupacional", description: "Integração sensorial e autonomia", active: true },
  ]

  const services: Service[] = [
    { id: "sv-psi", name: "Psicoterapia infantil", specialtyId: "sp-psi", durationMin: 50, referencePriceCents: 22000, requiresRoom: true, active: true },
    { id: "sv-neuro-av", name: "Avaliação neuropsicológica", specialtyId: "sp-neuro", durationMin: 60, referencePriceCents: 35000, requiresRoom: true, active: true },
    { id: "sv-neuro-dev", name: "Devolutiva neuropsicológica", specialtyId: "sp-neuro", durationMin: 60, referencePriceCents: 30000, requiresRoom: true, active: true },
    { id: "sv-aba", name: "Sessão ABA", specialtyId: "sp-aba", durationMin: 60, referencePriceCents: 18000, requiresRoom: true, active: true },
    { id: "sv-aba-fam", name: "Orientação familiar ABA", specialtyId: "sp-aba", durationMin: 50, referencePriceCents: 20000, requiresRoom: false, active: true },
    { id: "sv-fono", name: "Terapia fonoaudiológica", specialtyId: "sp-fono", durationMin: 45, referencePriceCents: 19000, requiresRoom: true, active: true },
    { id: "sv-fono-av", name: "Avaliação fonoaudiológica", specialtyId: "sp-fono", durationMin: 60, referencePriceCents: 26000, requiresRoom: true, active: true },
    { id: "sv-to", name: "Integração sensorial", specialtyId: "sp-to", durationMin: 50, referencePriceCents: 21000, requiresRoom: true, active: true },
  ]

  const rooms: Room[] = [
    { id: "rm-girassol", name: "Sala Girassol", capacity: 3, exclusive: true, active: true, notes: "Brinquedos simbólicos e mesa baixa" },
    { id: "rm-oceano", name: "Sala Oceano", capacity: 3, exclusive: true, active: true },
    { id: "rm-sensorial", name: "Sala de Integração Sensorial", capacity: 4, exclusive: true, active: true, notes: "Balanço, piscina de bolinhas e tatame" },
    { id: "rm-avaliacao", name: "Sala de Avaliação", capacity: 2, exclusive: true, active: true },
  ]

  const professionals: Professional[] = [
    { id: "pr-helena", name: "Helena Ramos", email: "helena@clinicaflor.demo", phone: "(11) 98811-2030", registry: "CRP 06/142233", specialtyIds: ["sp-psi"], active: true, colorIndex: 0, schedule: [...weekdays("08:00", "12:00"), ...weekdays("13:00", "17:00", [1, 3, 5])], unavailabilities: [], createdAt },
    { id: "pr-rafael", name: "Rafael Lins", email: "rafael@clinicaflor.demo", phone: "(11) 97721-4410", registry: "CRP 06/118745", specialtyIds: ["sp-neuro", "sp-psi"], active: true, colorIndex: 1, schedule: weekdays("09:00", "18:00", [1, 2, 4]), unavailabilities: [], createdAt },
    { id: "pr-camila", name: "Camila Torres", email: "camila@clinicaflor.demo", phone: "(11) 96650-7781", registry: "QASP 2231", specialtyIds: ["sp-aba"], active: true, colorIndex: 2, schedule: [...weekdays("08:00", "17:00"), { weekday: 6, start: "08:00", end: "12:00" }], unavailabilities: [], createdAt },
    { id: "pr-beatriz", name: "Beatriz Sales", email: "beatriz@clinicaflor.demo", phone: "(11) 95544-9012", registry: "CRFa 2-15530", specialtyIds: ["sp-fono"], active: true, colorIndex: 3, schedule: weekdays("08:00", "16:00"), unavailabilities: [], createdAt },
    { id: "pr-lucas", name: "Lucas Andrade", email: "lucas@clinicaflor.demo", phone: "(11) 94433-6620", registry: "CREFITO-3 18822-TO", specialtyIds: ["sp-to"], active: true, colorIndex: 4, schedule: weekdays("10:00", "19:00"), unavailabilities: [], createdAt },
    { id: "pr-sofia", name: "Sofia Nakamura", email: "sofia@clinicaflor.demo", phone: "(11) 93322-1145", registry: "CRP 06/160012", specialtyIds: ["sp-psi", "sp-aba"], active: true, colorIndex: 5, schedule: weekdays("13:00", "19:00"), unavailabilities: [], createdAt },
  ]

  const users: User[] = [
    { id: "u-admin", name: "Marina Couto", email: "marina@clinicaflor.demo", title: "Administração", roles: ["admin"] },
    { id: "u-recepcao", name: "Juliana Prado", email: "juliana@clinicaflor.demo", title: "Recepção", roles: ["reception"] },
    { id: "u-helena", name: "Helena Ramos", email: "helena@clinicaflor.demo", title: "Psicóloga", roles: ["professional"], professionalId: "pr-helena" },
    { id: "u-rafael", name: "Rafael Lins", email: "rafael@clinicaflor.demo", title: "Neuropsicólogo", roles: ["professional"], professionalId: "pr-rafael" },
    { id: "u-camila", name: "Camila Torres", email: "camila@clinicaflor.demo", title: "Analista do Comportamento", roles: ["professional"], professionalId: "pr-camila" },
    { id: "u-beatriz", name: "Beatriz Sales", email: "beatriz@clinicaflor.demo", title: "Fonoaudióloga e coordenadora", roles: ["professional", "manager"], professionalId: "pr-beatriz" },
    { id: "u-financeiro", name: "Otávio Mendes", email: "otavio@clinicaflor.demo", title: "Financeiro", roles: ["finance"] },
  ]

  const patientSeeds: Array<[string, string, string?]> = [
    ["Miguel Henrique Souza", "2017-03-14"],
    ["Alice Ferreira Lima", "2018-07-02"],
    ["Théo Martins Rocha", "2020-01-22"],
    ["Helena Duarte Campos", "2016-11-09"],
    ["Arthur Nogueira Pires", "2019-05-30"],
    ["Laura Bianchi Costa", "2015-09-17"],
    ["Davi Lucca Ribeiro", "2021-02-11"],
    ["Valentina Oliveira Sá", "2017-12-05"],
    ["Gael Monteiro Alves", "2018-04-19"],
    ["Cecília Moreira Dias", "2014-08-28"],
    ["Bernardo Teixeira Luz", "2016-06-03"],
    ["Maria Clara Fontes", "2019-10-12"],
    ["Samuel Cardoso Brito", "2020-07-25"],
    ["Lívia Antunes Rezende", "2015-02-14"],
    ["Pedro Augusto Viana", "2013-12-30"],
    ["Manuela Vieira Castro", "2018-09-08"],
    ["Benício Farias Leal", "2021-06-16"],
    ["Isadora Mello Prado", "2017-01-27"],
    ["Noah Carvalho Bastos", "2019-03-03"],
    ["Antonella Siqueira Reis", "2016-04-21"],
    ["Joaquim Barros Tavares", "2014-10-10"],
    ["Sophie Albuquerque Neves", "2020-11-29"],
    ["Ravi Gonçalves Pinto", "2018-02-06"],
    ["Elisa Machado Coelho", "2015-07-13", "inactive"],
    ["Lorenzo Batista Freire", "2017-08-24"],
  ]

  const primaryByIndex = ["pr-helena", "pr-rafael", "pr-camila", "pr-beatriz", "pr-lucas", "pr-sofia"]

  const patients: Patient[] = patientSeeds.map(([fullName, birthDate, status], i) => ({
    id: `pa-${String(i + 1).padStart(3, "0")}`,
    code: `PAC-${String(i + 1).padStart(4, "0")}`,
    fullName,
    birthDate,
    phone: `(11) 9${String(7000 + i * 137).slice(0, 4)}-${String(1000 + i * 311).slice(0, 4)}`,
    status: (status as Patient["status"]) ?? "active",
    mainProfessionalId: primaryByIndex[i % primaryByIndex.length],
    consentData: true,
    consentImage: i % 3 !== 0,
    createdAt,
    updatedAt: createdAt,
  }))

  const guardianFirstNames = ["Patrícia", "Fernando", "Renata", "Marcelo", "Aline", "Gustavo", "Tatiane", "Rodrigo", "Vanessa", "Eduardo"]
  const guardians: Guardian[] = []
  const links: PatientGuardianLink[] = []

  patients.forEach((p, i) => {
    const surname = p.fullName.split(" ").slice(-1)[0]
    const mother: Guardian = {
      id: `gu-${i * 2 + 1}`,
      fullName: `${guardianFirstNames[i % 5]} ${surname}`,
      phone: `(11) 9${8100 + i}-${4200 + i * 7}`,
      email: `${guardianFirstNames[i % 5].toLowerCase()}.${normalize(surname)}@email.demo`,
      createdAt,
    }
    guardians.push(mother)
    links.push({ id: `ln-${i * 2 + 1}`, patientId: p.id, guardianId: mother.id, relationship: "Mãe", isLegalGuardian: true, canSchedule: true, canReceiveDocuments: true, isPrimaryContact: true })

    if (i % 2 === 0) {
      const father: Guardian = {
        id: `gu-${i * 2 + 2}`,
        fullName: `${guardianFirstNames[5 + (i % 5)]} ${surname}`,
        phone: `(11) 9${8300 + i}-${5100 + i * 3}`,
        createdAt,
      }
      guardians.push(father)
      links.push({
        id: `ln-${i * 2 + 2}`,
        patientId: p.id,
        guardianId: father.id,
        relationship: "Pai",
        isLegalGuardian: i % 4 !== 0,
        canSchedule: i % 4 !== 0,
        canReceiveDocuments: i % 4 !== 0,
        isPrimaryContact: false,
        restrictions: i % 4 === 0 ? "Guarda unilateral da mãe — não autorizado a retirar documentos." : undefined,
      })
    }
  })

  const settings: ClinicSettings = {
    name: "Clínica Flor de Lótus",
    legalName: "Flor de Lótus Desenvolvimento Infantil Ltda.",
    document: "12.345.678/0001-90",
    phone: "(11) 3322-4455",
    email: "contato@clinicaflor.demo",
    address: "Rua das Acácias, 210 — Vila Mariana, São Paulo/SP",
    businessHours: [
      { weekday: 0, open: "08:00", close: "12:00", closed: true },
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, open: "07:30", close: "19:30", closed: false })),
      { weekday: 6, open: "08:00", close: "13:00", closed: false },
    ],
    minLeadMinutes: 60,
    lateToleranceMinutes: 15,
    rescheduleWindowHours: 24,
    requireCancelReason: true,
  }

  const appointments = seedAppointments({ professionals, services, patients, random, createdAt })

  const now = nowInClinic()
  const friday = addDays(startOfWeek(now, { weekStartsOn: 1 }), 4)
  const fridayKey = clinicDateKey(friday)
  professionals[4].unavailabilities.push({
    id: "un-1",
    start: clinicDateTimeToISO(fridayKey, "14:00"),
    end: clinicDateTimeToISO(fridayKey, "19:00"),
    reason: "Congresso de Integração Sensorial",
  })

  return {
    version: DB_VERSION,
    users,
    specialties,
    services,
    rooms,
    professionals,
    patients,
    guardians,
    links,
    appointments,
    settings,
    audit: [
      {
        id: "au-seed",
        at: createdAt,
        actorId: "system",
        actorName: "Sistema",
        action: "seed",
        resource: "clinic",
        resourceId: "clinic",
        summary: "Dados de demonstração carregados",
      },
    ],
    ...emptyModules(),
    counters: { patient: patients.length, financial: 0 },
  }
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function seedAppointments({
  professionals,
  services,
  patients,
  random,
  createdAt,
}: {
  professionals: Professional[]
  services: Service[]
  patients: Patient[]
  random: () => number
  createdAt: string
}): Appointment[] {
  const now = nowInClinic()
  const monday = startOfWeek(now, { weekStartsOn: 1 })
  const roomUsage = new Set<string>()
  const result: Appointment[] = []
  const activePatients = patients.filter((p) => p.status === "active")
  let counter = 0

  for (let dayOffset = 0; dayOffset < 6; dayOffset++) {
    const day = addDays(monday, dayOffset)
    const dateKey = clinicDateKey(day)
    const weekday = day.getDay()

    for (const prof of professionals) {
      const profServices = services.filter((s) => prof.specialtyIds.includes(s.specialtyId))
      for (const slot of prof.schedule.filter((s) => s.weekday === weekday)) {
        const startHour = Number(slot.start.slice(0, 2))
        const endHour = Number(slot.end.slice(0, 2))
        for (let hour = startHour; hour < endHour; hour++) {
          if (random() < 0.42) continue
          const service = profServices[Math.floor(random() * profServices.length)]
          const time = `${String(hour).padStart(2, "0")}:00`
          const start = clinicDateTimeToISO(dateKey, time)
          const end = new Date(new Date(start).getTime() + service.durationMin * 60_000).toISOString()

          let roomId: string | undefined
          if (service.requiresRoom) {
            const preferred = service.specialtyId === "sp-to" ? ["rm-sensorial"] : service.specialtyId === "sp-neuro" ? ["rm-avaliacao", "rm-oceano"] : ["rm-girassol", "rm-oceano", "rm-avaliacao"]
            roomId = preferred.find((r) => !roomUsage.has(`${dateKey}-${hour}-${r}`))
            if (!roomId) continue
            roomUsage.add(`${dateKey}-${hour}-${roomId}`)
          }

          const candidates = activePatients.filter((p) => p.mainProfessionalId === prof.id)
          const pool = candidates.length && random() < 0.7 ? candidates : activePatients
          const patient = pool[Math.floor(random() * pool.length)]

          counter++
          result.push({
            id: `ap-${String(counter).padStart(4, "0")}`,
            kind: "appointment",
            patientId: patient.id,
            serviceId: service.id,
            professionalId: prof.id,
            roomId,
            start,
            end,
            status: statusFor(start, end, now, random),
            createdBy: "u-recepcao",
            createdAt,
            updatedAt: createdAt,
          })
        }
      }
    }
  }

  const wednesday = clinicDateKey(addDays(monday, 2))
  for (const prof of professionals.filter((p) => p.schedule.some((s) => s.weekday === 3 && s.start <= "12:00" && s.end >= "13:00"))) {
    const start = clinicDateTimeToISO(wednesday, "12:00")
    const end = clinicDateTimeToISO(wednesday, "13:00")
    if (result.some((a) => a.professionalId === prof.id && a.start < end && a.end > start)) continue
    counter++
    result.push({
      id: `ap-${String(counter).padStart(4, "0")}`,
      kind: "block",
      title: "Reunião clínica",
      professionalId: prof.id,
      start,
      end,
      status: "confirmed",
      createdBy: "u-admin",
      createdAt,
      updatedAt: createdAt,
    })
  }

  return result.map((a) => {
    if (a.status !== "cancelled") return a
    return { ...a, cancelReason: "Família informou indisposição da criança", cancelledBy: "u-recepcao", cancelledAt: createdAt }
  })
}

function statusFor(start: string, end: string, now: Date, random: () => number): AppointmentStatus {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  const n = now.getTime()
  const r = random()
  if (e < n) return r < 0.08 ? "no_show" : r < 0.16 ? "cancelled" : "completed"
  if (s <= n && e >= n) return "in_progress"
  if (s - n < 24 * 3600_000) return r < 0.85 ? "confirmed" : "pending"
  return r < 0.55 ? "confirmed" : r < 0.8 ? "pending" : r < 0.93 ? "requested" : "cancelled"
}

export const STATUS_ORDER = Object.keys(STATUS_LABELS) as AppointmentStatus[]
