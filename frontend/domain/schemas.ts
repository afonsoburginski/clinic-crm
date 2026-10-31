import { z } from "zod"

import { hasCentPrecision } from "./financial"

const optionalText = z.string().trim().max(500)
const optionalEmail = z.union([z.literal(""), z.email("E-mail inválido")])
const phone = z
  .string()
  .trim()
  .refine((v) => v === "" || v.replace(/\D/g, "").length >= 10, "Telefone incompleto")

export function isValidCPF(value: string) {
  const cpf = value.replace(/\D/g, "")
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  const digit = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

const cpf = z
  .string()
  .trim()
  .refine((v) => v === "" || isValidCPF(v), "CPF inválido")

export const patientSchema = z.object({
  fullName: z.string().trim().min(3, "Informe o nome completo").max(120),
  socialName: optionalText,
  birthDate: z
    .string()
    .min(1, "Informe a data de nascimento")
    .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v) <= new Date(), "Data inválida"),
  document: cpf,
  phone,
  email: optionalEmail,
  address: optionalText,
  status: z.enum(["active", "inactive", "archived"]),
  mainProfessionalId: z.string(),
  consentData: z.boolean(),
  consentImage: z.boolean(),
  administrativeNotes: z.string().trim().max(1000),
})
export type PatientInput = z.infer<typeof patientSchema>

export const guardianSchema = z.object({
  fullName: z.string().trim().min(3, "Informe o nome completo").max(120),
  document: cpf,
  phone: phone.refine((v) => v !== "", "Informe um telefone"),
  email: optionalEmail,
})
export type GuardianInput = z.infer<typeof guardianSchema>

export const guardianLinkSchema = z.object({
  guardianId: z.string().min(1, "Selecione um responsável"),
  relationship: z.string().trim().min(2, "Informe o parentesco"),
  isLegalGuardian: z.boolean(),
  canSchedule: z.boolean(),
  canReceiveDocuments: z.boolean(),
  isPrimaryContact: z.boolean(),
  restrictions: z.string().trim().max(300),
})
export type GuardianLinkInput = z.infer<typeof guardianLinkSchema>

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido")

export const weeklySlotSchema = z
  .object({ weekday: z.number().int().min(0).max(6), start: hhmm, end: hhmm })
  .refine((s) => s.end > s.start, { message: "Término deve ser após o início", path: ["end"] })

export const professionalSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome").max(120),
  email: z.email("E-mail inválido"),
  phone,
  registry: optionalText,
  specialtyIds: z.array(z.string()).min(1, "Selecione ao menos uma especialidade"),
  active: z.boolean(),
})
export type ProfessionalInput = z.infer<typeof professionalSchema>

export const unavailabilitySchema = z
  .object({
    date: z.string().min(1, "Informe a data"),
    startTime: hhmm,
    endTime: hhmm,
    reason: z.string().trim().min(3, "Informe o motivo"),
  })
  .refine((v) => v.endTime > v.startTime, { message: "Término deve ser após o início", path: ["endTime"] })
export type UnavailabilityInput = z.infer<typeof unavailabilitySchema>

export const specialtySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  description: optionalText,
  active: z.boolean(),
})
export type SpecialtyInput = z.infer<typeof specialtySchema>

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  specialtyId: z.string().min(1, "Selecione a especialidade"),
  durationMin: z.number({ error: "Informe a duração" }).int().min(10, "Mínimo de 10 min").max(480),
  referencePrice: z.number({ error: "Informe o valor" }).min(0, "Valor inválido"),
  requiresRoom: z.boolean(),
  active: z.boolean(),
})
export type ServiceInput = z.infer<typeof serviceSchema>

export const roomSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  capacity: z.number({ error: "Informe a capacidade" }).int().min(1).max(50),
  exclusive: z.boolean(),
  active: z.boolean(),
  notes: optionalText,
})
export type RoomInput = z.infer<typeof roomSchema>

export const settingsSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  legalName: z.string().trim().min(2, "Informe a razão social"),
  document: z.string().trim().min(14, "CNPJ incompleto"),
  phone,
  email: z.email("E-mail inválido"),
  address: z.string().trim().min(5, "Informe o endereço"),
  businessHours: z.array(
    z.object({ weekday: z.number(), open: hhmm, close: hhmm, closed: z.boolean() })
  ),
  minLeadMinutes: z.number().int().min(0).max(10080),
  lateToleranceMinutes: z.number().int().min(0).max(120),
  rescheduleWindowHours: z.number().int().min(0).max(720),
  requireCancelReason: z.boolean(),
})
export type SettingsInput = z.infer<typeof settingsSchema>

export interface AppointmentInput {
  kind: "appointment" | "block"
  title?: string
  patientId?: string
  serviceId?: string
  professionalId: string
  roomId?: string
  start: string
  end: string
  notes?: string
  status?: "requested" | "pending" | "confirmed"
  recurrenceWeeks?: number
}

export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido").trim().toLowerCase(),
  password: z.string().min(8, "A senha tem pelo menos 8 caracteres"),
})
export type LoginInput = z.infer<typeof loginSchema>

// ---------------------------------------------------------------- PRN / AVA / ABA / FIN / DOC

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Data inválida")

const reason = (min: number, label = "o motivo") =>
  z.string().trim().min(min, `Informe ${label} (mínimo ${min} caracteres)`).max(500)

export const reasonSchema = z.object({ reason: reason(5) })
export type ReasonInput = z.infer<typeof reasonSchema>

export const rectificationSchema = z.object({ reason: reason(10, "o motivo da retificação") })
export type RectificationInput = z.infer<typeof rectificationSchema>

export const clinicalRecordSchema = z.object({
  kind: z.enum(["anamnesis", "evolution", "document"]),
  title: z.string().trim().min(3, "Informe o título").max(120),
  content: z.string().trim().max(20000),
  appointmentId: z.string(),
})
export type ClinicalRecordInput = z.infer<typeof clinicalRecordSchema>

export const assessmentSchema = z.object({
  patientId: z.string().min(1, "Selecione o paciente"),
  title: z.string().trim().min(3, "Informe o título").max(120),
  purpose: z.string().trim().min(5, "Informe a finalidade").max(500),
  responsibleProfessionalId: z.string().min(1, "Selecione o responsável"),
  stages: z
    .array(z.string().trim().min(2, "Etapa muito curta").max(80))
    .min(1, "Inclua ao menos uma etapa"),
})
export type AssessmentInput = z.infer<typeof assessmentSchema>

/** Formulário: uma etapa por linha (convertida com `stagesFromText`). */
export const assessmentFormSchema = assessmentSchema
  .omit({ stages: true })
  .extend({ stagesText: z.string().trim().min(2, "Inclua ao menos uma etapa") })
export type AssessmentFormInput = z.infer<typeof assessmentFormSchema>

export const stagesFromText = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

export const interpretationSchema = z.object({
  text: z.string().trim().min(20, "A interpretação precisa de ao menos 20 caracteres").max(10000),
})
export type InterpretationInput = z.infer<typeof interpretationSchema>

export const abaGoalSchema = z.object({
  title: z.string().trim().min(3, "Informe o objetivo").max(120),
  description: z.string().trim().max(500),
  criterionText: z.string().trim().min(10, "Descreva o critério de alcance (mínimo 10 caracteres)").max(300),
  targetPercent: z.number({ error: "Informe a meta em %" }).int("Use um número inteiro").min(1, "Mínimo 1%").max(100, "Máximo 100%"),
  consecutiveSessions: z.number({ error: "Informe as sessões" }).int("Use um número inteiro").min(1, "Mínimo 1").max(10, "Máximo 10"),
})
export type AbaGoalInput = z.infer<typeof abaGoalSchema>

export const abaPlanSchema = z.object({
  patientId: z.string().min(1, "Selecione o paciente"),
  title: z.string().trim().min(3, "Informe o título").max(120),
  startDate: ymd,
  reviewDate: z.union([z.literal(""), ymd]),
  responsibleProfessionalId: z.string().min(1, "Selecione o responsável"),
})
export type AbaPlanInput = z.infer<typeof abaPlanSchema>

/** RN-ABA-006: só se sai de `ativo`, para `alcançado` ou `descontinuado` — nunca de volta a `ativo`. */
export const abaGoalStatusSchema = z.object({
  to: z.enum(["achieved", "discontinued"], { error: "Escolha alcançado ou descontinuado" }),
  reason: z.string().trim().max(500),
})
export type AbaGoalStatusInput = z.infer<typeof abaGoalStatusSchema>

export const abaSessionSchema = z.object({
  planId: z.string().min(1),
  date: ymd,
  notes: z.string().trim().max(1000),
  measures: z
    .array(
      z.object({
        goalId: z.string().min(1),
        trials: z.number({ error: "Informe as tentativas" }).int().min(1, "Mínimo de 1 tentativa").max(200),
        correct: z.number({ error: "Informe os acertos" }).int().min(0, "Acertos inválidos").max(200),
        note: z.string().trim().max(200),
      })
    )
    .min(1, "Registre ao menos uma medida"),
})
export type AbaSessionInput = z.infer<typeof abaSessionSchema>

export const PAYMENT_METHODS = ["cash", "pix", "card", "transfer", "boleto", "other"] as const

/** RN-FIN-001: reais com no máximo 2 casas decimais e ao menos R$ 0,01 (sem arredondar para zero). */
const money = z
  .number({ error: "Informe o valor" })
  .positive("O valor deve ser maior que zero")
  .max(10_000_000, "Valor muito alto")
  .refine((v) => Math.round(v * 100) >= 1, "O valor deve ser maior que zero (mínimo R$ 0,01)")
  .refine(hasCentPrecision, "O valor deve ter no máximo 2 casas decimais")

export const financialEntrySchema = z.object({
  kind: z.enum(["income", "expense"]),
  description: z.string().trim().min(3, "Informe a descrição").max(120),
  category: z.string().trim().min(2, "Informe a categoria").max(60),
  counterparty: z.string().trim().max(120),
  patientId: z.string(),
  competence: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida (AAAA-MM)"),
  dueDate: ymd,
  amount: money,
})
export type FinancialEntryInput = z.infer<typeof financialEntrySchema>

export const paymentSchema = z.object({
  amount: money,
  paidAt: ymd,
  method: z.enum(PAYMENT_METHODS),
  requestId: z.string().min(1),
})
export type PaymentInput = z.infer<typeof paymentSchema>

export const documentSchema = z.object({
  patientId: z.string().min(1, "Selecione o paciente"),
  title: z.string().trim().min(3, "Informe o título").max(120),
  type: z.string().trim().min(2, "Informe o tipo").max(60),
  classification: z.enum(["clinical", "administrative", "financial"]),
  clinicalRecordId: z.string(),
  notes: z.string().trim().max(500),
})
export type DocumentInput = z.infer<typeof documentSchema>

export const releaseSchema = z.object({ guardianId: z.string().min(1, "Selecione o responsável") })
export type ReleaseInput = z.infer<typeof releaseSchema>
