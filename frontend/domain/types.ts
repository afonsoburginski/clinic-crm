export type Role = "admin" | "reception" | "professional" | "finance" | "manager"

export interface User {
  id: string
  name: string
  email: string
  title: string
  roles: Role[]
  /** Permissões efetivas resolvidas pela API (matriz de papéis do banco); ausente só em sessões antigas. */
  permissions?: string[]
  professionalId?: string
}

/** Usuário da clínica como a tela de gestão o vê (nunca traz senha). */
export interface UserAccount {
  id: string
  name: string
  email: string
  active: boolean
  roles: Role[]
  professionalId?: string
  createdAt: string
  updatedAt: string
}

export interface RoleView {
  key: Role
  label: string
  description: string
  isSystem: boolean
  /** Permissões que o papel concede, na matriz salva no banco. */
  permissions: string[]
  userCount: number
}

export interface PermissionGroup {
  group: string
  permissions: { key: string; label: string; group: string }[]
}

export interface Specialty {
  id: string
  name: string
  description?: string
  active: boolean
}

export interface Service {
  id: string
  name: string
  specialtyId: string
  durationMin: number
  referencePriceCents: number
  requiresRoom: boolean
  active: boolean
}

export interface Room {
  id: string
  name: string
  capacity: number
  exclusive: boolean
  active: boolean
  notes?: string
}

export interface WeeklySlot {
  weekday: number
  start: string
  end: string
}

export interface Unavailability {
  id: string
  start: string
  end: string
  reason: string
}

export interface Professional {
  id: string
  name: string
  email: string
  phone?: string
  registry?: string
  specialtyIds: string[]
  active: boolean
  colorIndex: number
  schedule: WeeklySlot[]
  unavailabilities: Unavailability[]
  createdAt: string
}

export type PatientStatus = "active" | "inactive" | "archived"

export interface Patient {
  id: string
  code: string
  fullName: string
  socialName?: string
  birthDate: string
  document?: string
  phone?: string
  email?: string
  address?: string
  status: PatientStatus
  mainProfessionalId?: string
  consentData: boolean
  consentImage: boolean
  administrativeNotes?: string
  createdAt: string
  updatedAt: string
}

export interface Guardian {
  id: string
  fullName: string
  document?: string
  phone: string
  email?: string
  createdAt: string
}

export interface PatientGuardianLink {
  id: string
  patientId: string
  guardianId: string
  relationship: string
  isLegalGuardian: boolean
  canSchedule: boolean
  canReceiveDocuments: boolean
  isPrimaryContact: boolean
  restrictions?: string
}

export type AppointmentStatus =
  | "requested"
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"

export type AppointmentKind = "appointment" | "block"

export interface Appointment {
  id: string
  kind: AppointmentKind
  title?: string
  patientId?: string
  serviceId?: string
  professionalId: string
  roomId?: string
  start: string
  end: string
  status: AppointmentStatus
  notes?: string
  recurrenceGroupId?: string
  cancelReason?: string
  cancelledBy?: string
  cancelledAt?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface BusinessDay {
  weekday: number
  open: string
  close: string
  closed: boolean
}

export interface ClinicSettings {
  name: string
  legalName: string
  document: string
  phone: string
  email: string
  address: string
  businessHours: BusinessDay[]
  minLeadMinutes: number
  lateToleranceMinutes: number
  rescheduleWindowHours: number
  requireCancelReason: boolean
}

export interface AuditEntry {
  id: string
  at: string
  actorId: string
  actorName: string
  action: string
  resource: string
  resourceId: string
  summary: string
  changes?: Record<string, { from: unknown; to: unknown }>
}

// ---------------------------------------------------------------- prontuário (PRN)

export type ClinicalRecordKind = "anamnesis" | "evolution" | "document"
export type ClinicalRecordStatus = "draft" | "finalized" | "rectified"
export type ClinicalRecordAction = "created" | "updated" | "finalized" | "rectification_started" | "rectified"

export interface ClinicalRecordEvent {
  at: string
  actorId: string
  actorName: string
  action: ClinicalRecordAction
}

export interface ClinicalRecord {
  id: string
  patientId: string
  kind: ClinicalRecordKind
  title: string
  content: string
  appointmentId?: string
  status: ClinicalRecordStatus
  version: number
  /** Id da primeira versão; estável ao longo das retificações. */
  rootId: string
  rectifiesId?: string
  rectificationReason?: string
  supersededById?: string
  authorId: string
  authorName: string
  professionalId: string
  createdAt: string
  updatedAt: string
  finalizedAt?: string
  history: ClinicalRecordEvent[]
}

// ---------------------------------------------------------------- avaliações (AVA)

export type AssessmentStatus = "in_progress" | "completed" | "cancelled"
export type AssessmentStageStatus = "pending" | "in_progress" | "done"

export interface AssessmentStage {
  id: string
  name: string
  status: AssessmentStageStatus
  doneAt?: string
}

export interface AssessmentInterpretation {
  id: string
  version: number
  text: string
  authorId: string
  authorName: string
  at: string
}

export interface AssessmentEvent {
  at: string
  actorId: string
  actorName: string
  summary: string
}

export interface Assessment {
  id: string
  patientId: string
  title: string
  purpose: string
  responsibleProfessionalId: string
  status: AssessmentStatus
  stages: AssessmentStage[]
  interpretations: AssessmentInterpretation[]
  history: AssessmentEvent[]
  cancelReason?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

// ---------------------------------------------------------------- ABA

export type AbaPlanStatus = "draft" | "active" | "closed"
export type AbaGoalStatus = "active" | "achieved" | "discontinued"

export interface AbaGoal {
  id: string
  title: string
  description?: string
  /** Critério explícito de alcance (RN-ABA-002). */
  criterionText: string
  targetPercent: number
  consecutiveSessions: number
  status: AbaGoalStatus
  statusReason?: string
}

export interface AbaChange {
  at: string
  actorId: string
  actorName: string
  summary: string
  changes?: Record<string, { from: unknown; to: unknown }>
}

export interface AbaPlan {
  id: string
  patientId: string
  title: string
  startDate: string
  reviewDate?: string
  responsibleProfessionalId: string
  status: AbaPlanStatus
  closeReason?: string
  goals: AbaGoal[]
  changeLog: AbaChange[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface AbaMeasure {
  goalId: string
  trials: number
  correct: number
  note?: string
}

export interface AbaSession {
  id: string
  planId: string
  patientId: string
  date: string
  professionalId: string
  authorId: string
  authorName: string
  measures: AbaMeasure[]
  notes?: string
  createdAt: string
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
}

// ---------------------------------------------------------------- financeiro (FIN)

export type FinancialKind = "income" | "expense"
export type FinancialEntryStatus = "open" | "partial" | "paid" | "overdue" | "cancelled"
export type PaymentMethod = "cash" | "pix" | "card" | "transfer" | "boleto" | "other"

/** Sem campos clínicos por desenho (RN-FIN-009). */
export interface FinancialEntry {
  id: string
  code: string
  kind: FinancialKind
  description: string
  category: string
  counterparty?: string
  patientId?: string
  competence: string
  dueDate: string
  amountCents: number
  cancelledAt?: string
  cancelledBy?: string
  cancelReason?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface FinancialPayment {
  id: string
  entryId: string
  amountCents: number
  paidAt: string
  method: PaymentMethod
  requestId: string
  registeredBy: string
  registeredByName: string
  createdAt: string
  reversedAt?: string
  reversedBy?: string
  reverseReason?: string
}

// ---------------------------------------------------------------- documentos (DOC)

export type DocumentClassification = "clinical" | "administrative" | "financial"
export type DocumentStatus = "draft" | "issued" | "archived"

export interface DocumentRelease {
  id: string
  guardianId: string
  releasedBy: string
  releasedByName: string
  releasedAt: string
  revokedAt?: string
  revokedBy?: string
  revokeReason?: string
}

export interface PatientDocument {
  id: string
  patientId: string
  title: string
  type: string
  classification: DocumentClassification
  status: DocumentStatus
  /** Id raiz do registro clínico (somente classificação clínica). */
  clinicalRecordId?: string
  notes?: string
  releases: DocumentRelease[]
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  issuedAt?: string
  archivedAt?: string
}
