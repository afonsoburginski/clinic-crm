import { clinicDateKey } from "@/domain/clinic-time"
import { activatePlan, closePlan, createPlan, goalProgress, saveGoal, sessionLog, setGoalStatus, updatePlan, validateSession, voidSession } from "@/domain/aba"
import {
  addInterpretation,
  assertResponsibleOperable,
  cancelAssessment,
  completeAssessment,
  createAssessment,
  setStageStatus,
} from "@/domain/assessment"
import {
  RECORD_KIND_LABELS,
  canReadClinical,
  canWriteClinical,
  editDraft,
  finalizeDraft,
  newDraft,
  startRectification,
  versionChain,
} from "@/domain/clinical-record"
import { revokeAllReleases } from "@/domain/documents"
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors"
import { can } from "@/domain/permissions"
import {
  abaGoalSchema,
  abaGoalStatusSchema,
  abaPlanSchema,
  abaSessionSchema,
  assessmentSchema,
  clinicalRecordSchema,
  interpretationSchema,
  reasonSchema,
  rectificationSchema,
  type AbaGoalInput,
  type AbaGoalStatusInput,
  type AbaPlanInput,
  type AbaSessionInput,
  type AssessmentInput,
  type ClinicalRecordInput,
  type InterpretationInput,
  type ReasonInput,
  type RectificationInput,
} from "@/domain/schemas"
import type {
  AbaGoalStatus,
  AbaPlan,
  AbaPlanStatus,
  AbaSession,
  Assessment,
  AssessmentStageStatus,
  AssessmentStatus,
  ClinicalRecord,
  ClinicalRecordKind,
  Patient,
  User,
} from "@/domain/types"
import { commit, getDB, simulateLatency, uid } from "@/shared/lib/demo-db"

import { actor, audit, auditRead, now, ownPatientIds, parse, patientIdsOf } from "./demo-context"

// RN-PRN-001/002 — todo acesso clínico exige permissão E vínculo com o paciente.

function assertClinicalPermission(user: User, mode: "read" | "write") {
  if (!can(user, mode === "read" ? "clinical:read" : "clinical:write")) {
    throw new ForbiddenError("Seu perfil não tem acesso a dados clínicos.")
  }
}

function requireClinical(user: User, patientId: string, mode: "read" | "write"): Patient {
  assertClinicalPermission(user, mode)
  const own = ownPatientIds(user).has(patientId)
  const allowed = mode === "read" ? canReadClinical(user, own) : canWriteClinical(user, own)
  if (!allowed) throw new ForbiddenError("Você não tem acesso ao prontuário deste paciente.")
  const patient = getDB().patients.find((p) => p.id === patientId)
  if (!patient) throw new NotFoundError("Paciente não encontrado.")
  return patient
}

/** RN-AVA-001: avaliação e plano precisam de responsável que possa operá-los (ativo, com conta clínica e vínculo). */
function requireResponsible(professionalId: string, patientId: string) {
  const db = getDB()
  assertResponsibleOperable({
    active: !!db.professionals.find((p) => p.id === professionalId)?.active,
    hasClinicalAccount: db.users.some((u) => u.professionalId === professionalId && can(u, "clinical:write")),
    linkedToPatient: patientIdsOf(professionalId).has(patientId),
  })
}

function sortedBy<T>(items: T[], key: (item: T) => string) {
  return [...items].sort((a, b) => key(b).localeCompare(key(a)))
}

// ---------------------------------------------------------------- prontuário

function findRecord(id: string): ClinicalRecord {
  const record = getDB().clinicalRecords.find((r) => r.id === id)
  if (!record) throw new NotFoundError("Registro não encontrado.")
  return record
}

function putRecord(next: ClinicalRecord) {
  const db = getDB()
  db.clinicalRecords[db.clinicalRecords.findIndex((r) => r.id === next.id)] = next
}

function linkedAppointmentId(user: User, patientId: string, data: ClinicalRecordInput) {
  if (data.kind !== "evolution" || !data.appointmentId) return undefined
  const appt = getDB().appointments.find((a) => a.id === data.appointmentId)
  if (!appt || appt.patientId !== patientId || appt.professionalId !== user.professionalId) {
    throw new ValidationError("O atendimento informado não pertence a este paciente e profissional.")
  }
  return appt.id
}

/** RN-PRN-008: a auditoria registra o fato, nunca o conteúdo. */
const describe = (r: Pick<ClinicalRecord, "kind">, patient: Patient) =>
  `${RECORD_KIND_LABELS[r.kind]} clínico`

export const clinicalRecordsApi = {
  async patients() {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "read")
    const db = getDB()
    const own = ownPatientIds(user)
    return db.patients
      .filter((p) => own.has(p.id))
      .map((patient) => {
        const records = db.clinicalRecords.filter((r) => r.patientId === patient.id)
        return {
          patient,
          total: records.length,
          drafts: records.filter((r) => r.status === "draft").length,
          lastAt: records.map((r) => r.updatedAt).sort().at(-1),
        }
      })
      .sort((a, b) => a.patient.fullName.localeCompare(b.patient.fullName, "pt-BR"))
  },

  async list(patientId: string, filters: { kind?: ClinicalRecordKind | "all" } = {}) {
    await simulateLatency()
    const user = actor()
    requireClinical(user, patientId, "read")
    auditRead(user, "clinical_record", patientId, "Consultou registros do prontuário")
    return sortedBy(
      getDB().clinicalRecords.filter((r) => r.patientId === patientId && (!filters.kind || filters.kind === "all" || r.kind === filters.kind)),
      (r) => r.createdAt
    )
  },

  async get(id: string) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "read")
    const record = findRecord(id)
    requireClinical(user, record.patientId, "read")
    auditRead(user, "clinical_record", id, "Consultou registro do prontuário")
    return record
  },

  async versions(rootId: string) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "read")
    const chain = versionChain(getDB().clinicalRecords, rootId)
    if (!chain.length) throw new NotFoundError("Registro não encontrado.")
    requireClinical(user, chain[0].patientId, "read")
    auditRead(user, "clinical_record", rootId, "Consultou versões de registro do prontuário")
    return chain
  },

  async create(patientId: string, input: ClinicalRecordInput) {
    await simulateLatency()
    const user = actor()
    const patient = requireClinical(user, patientId, "write")
    const data = parse<ClinicalRecordInput>(clinicalRecordSchema, input)
    const record = newDraft(
      { id: uid("rc"), patientId, kind: data.kind, title: data.title, content: data.content, appointmentId: linkedAppointmentId(user, patientId, data) },
      user,
      now()
    )
    getDB().clinicalRecords.push(record)
    audit(user, "create", "clinical_record", record.id, `Criou rascunho de ${describe(record, patient)}`)
    commit()
    return record
  },

  async update(id: string, input: ClinicalRecordInput) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const record = findRecord(id)
    const patient = requireClinical(user, record.patientId, "write")
    const data = parse<ClinicalRecordInput>(clinicalRecordSchema, { ...input, kind: record.kind })
    const next = editDraft(record, { title: data.title, content: data.content, appointmentId: linkedAppointmentId(user, record.patientId, data) }, user, now())
    putRecord(next)
    audit(user, "update", "clinical_record", id, `Editou rascunho de ${describe(record, patient)}`)
    commit()
    return next
  },

  async finalize(id: string) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const record = findRecord(id)
    const patient = requireClinical(user, record.patientId, "write")
    const at = now()
    const original = record.rectifiesId ? findRecord(record.rectifiesId) : undefined
    const { record: finalized, superseded } = finalizeDraft(record, user, at, original)
    putRecord(finalized)
    if (superseded) {
      putRecord(superseded)
      // RN-PRN-010 / RN-DOC-006: documento ligado ao registro precisa ser liberado de novo.
      const db = getDB()
      db.documents = db.documents.map((d) =>
        d.clinicalRecordId === record.rootId ? revokeAllReleases(d, "Registro clínico retificado", user, at) : d
      )
    }
    audit(
      user,
      "status_change",
      "clinical_record",
      id,
      `${superseded ? "Finalizou retificação de" : "Finalizou"} ${describe(record, patient)}`
    )
    commit()
    return finalized
  },

  async rectify(id: string, input: RectificationInput) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const original = findRecord(id)
    const patient = requireClinical(user, original.patientId, "write")
    const data = parse<RectificationInput>(rectificationSchema, input)
    const draft = startRectification(original, getDB().clinicalRecords, { id: uid("rc"), reason: data.reason }, user, now())
    getDB().clinicalRecords.push(draft)
    audit(user, "create", "clinical_record", draft.id, `Iniciou retificação de ${describe(original, patient)}`)
    commit()
    return draft
  },
}

// ---------------------------------------------------------------- avaliações

function findAssessment(id: string): Assessment {
  const a = getDB().assessments.find((x) => x.id === id)
  if (!a) throw new NotFoundError("Avaliação não encontrada.")
  return a
}

function putAssessment(next: Assessment) {
  const db = getDB()
  db.assessments[db.assessments.findIndex((a) => a.id === next.id)] = next
}

export const assessmentsApi = {
  async list(filters: { patientId?: string; status?: AssessmentStatus | "all" } = {}) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "read")
    const own = ownPatientIds(user)
    auditRead(user, "assessment", filters.patientId && own.has(filters.patientId) ? filters.patientId : "own", "Consultou avaliações clínicas")
    return sortedBy(
      getDB().assessments
        .filter((a) => own.has(a.patientId))
        .filter((a) => !filters.patientId || a.patientId === filters.patientId)
        .filter((a) => !filters.status || filters.status === "all" || a.status === filters.status),
      (a) => a.createdAt
    )
  },

  async get(id: string) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "read")
    const a = findAssessment(id)
    requireClinical(user, a.patientId, "read")
    auditRead(user, "assessment", id, "Consultou avaliação clínica")
    return a
  },

  async create(input: AssessmentInput) {
    await simulateLatency()
    const user = actor()
    const data = parse<AssessmentInput>(assessmentSchema, input)
    const patient = requireClinical(user, data.patientId, "write")
    requireResponsible(data.responsibleProfessionalId, data.patientId)
    const a = createAssessment({ id: uid("av"), ...data }, () => uid("st"), user, now())
    getDB().assessments.push(a)
    audit(user, "create", "assessment", a.id, "Abriu avaliação clínica")
    commit()
    return a
  },

  async setStage(id: string, stageId: string, to: AssessmentStageStatus) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const a = findAssessment(id)
    const patient = requireClinical(user, a.patientId, "write")
    const next = setStageStatus(a, stageId, to, user, now())
    putAssessment(next)
    audit(user, "update", "assessment", id, "Atualizou etapa de avaliação clínica")
    commit()
    return next
  },

  async saveInterpretation(id: string, input: InterpretationInput) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const a = findAssessment(id)
    const patient = requireClinical(user, a.patientId, "write")
    const data = parse<InterpretationInput>(interpretationSchema, input)
    const next = addInterpretation(a, data.text, uid("it"), user, now())
    putAssessment(next)
    audit(user, "update", "assessment", id, "Registrou interpretação de avaliação clínica")
    commit()
    return next
  },

  async complete(id: string) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const a = findAssessment(id)
    const patient = requireClinical(user, a.patientId, "write")
    const next = completeAssessment(a, user, now())
    putAssessment(next)
    audit(user, "status_change", "assessment", id, "Concluiu avaliação clínica")
    commit()
    return next
  },

  async cancel(id: string, input: ReasonInput) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const a = findAssessment(id)
    const patient = requireClinical(user, a.patientId, "write")
    const data = parse<ReasonInput>(reasonSchema, input)
    const next = cancelAssessment(a, data.reason, user, now())
    putAssessment(next)
    audit(user, "status_change", "assessment", id, "Cancelou avaliação clínica")
    commit()
    return next
  },
}

// ---------------------------------------------------------------- ABA

function findPlan(id: string): AbaPlan {
  const plan = getDB().abaPlans.find((p) => p.id === id)
  if (!plan) throw new NotFoundError("Plano não encontrado.")
  return plan
}

function putPlan(next: AbaPlan) {
  const db = getDB()
  db.abaPlans[db.abaPlans.findIndex((p) => p.id === next.id)] = next
}

const sessionsOf = (planId: string) => getDB().abaSessions.filter((s) => s.planId === planId)

/** Progresso calculado só das medidas registradas (RN-ABA-004). */
function planView(plan: AbaPlan) {
  const sessions = sessionsOf(plan.id)
  return {
    plan,
    sessions: [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    progress: plan.goals.map((g) => goalProgress(g, sessions)),
  }
}

export const abaApi = {
  async listPlans(filters: { patientId?: string; status?: AbaPlanStatus | "all" } = {}) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "read")
    const own = ownPatientIds(user)
    auditRead(user, "aba_plan", filters.patientId && own.has(filters.patientId) ? filters.patientId : "own", "Consultou planos ABA")
    return sortedBy(
      getDB().abaPlans
        .filter((p) => own.has(p.patientId))
        .filter((p) => !filters.patientId || p.patientId === filters.patientId)
        .filter((p) => !filters.status || filters.status === "all" || p.status === filters.status),
      (p) => p.createdAt
    )
  },

  async getPlan(id: string) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "read")
    const plan = findPlan(id)
    requireClinical(user, plan.patientId, "read")
    auditRead(user, "aba_plan", id, "Consultou plano ABA")
    return planView(plan)
  },

  async createPlan(input: AbaPlanInput) {
    await simulateLatency()
    const user = actor()
    const data = parse<AbaPlanInput>(abaPlanSchema, input)
    const patient = requireClinical(user, data.patientId, "write")
    requireResponsible(data.responsibleProfessionalId, data.patientId)
    const plan = createPlan({ id: uid("ab"), ...data, reviewDate: data.reviewDate || undefined }, user, now())
    getDB().abaPlans.push(plan)
    audit(user, "create", "aba_plan", plan.id, "Criou plano ABA")
    commit()
    return plan
  },

  async updatePlan(id: string, input: AbaPlanInput) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const plan = findPlan(id)
    const patient = requireClinical(user, plan.patientId, "write")
    const data = parse<AbaPlanInput>(abaPlanSchema, input)
    requireResponsible(data.responsibleProfessionalId, plan.patientId)
    const next = updatePlan(
      plan,
      { title: data.title, startDate: data.startDate, reviewDate: data.reviewDate || undefined, responsibleProfessionalId: data.responsibleProfessionalId },
      user,
      now()
    )
    putPlan(next)
    audit(user, "update", "aba_plan", id, "Alterou plano ABA")
    commit()
    return next
  },

  async saveGoal(planId: string, input: AbaGoalInput, goalId?: string) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const plan = findPlan(planId)
    const patient = requireClinical(user, plan.patientId, "write")
    const data = parse<AbaGoalInput>(abaGoalSchema, input)
    const next = saveGoal(plan, { ...data, description: data.description || undefined }, goalId, uid("go"), user, now(), sessionsOf(planId))
    putPlan(next)
    audit(user, goalId ? "update" : "create", "aba_plan", planId, `${goalId ? "Alterou" : "Adicionou"} objetivo ABA`)
    commit()
    return next
  },

  async setGoalStatus(planId: string, goalId: string, input: AbaGoalStatusInput) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const plan = findPlan(planId)
    const patient = requireClinical(user, plan.patientId, "write")
    const data = parse<AbaGoalStatusInput>(abaGoalStatusSchema, input)
    const next = setGoalStatus(plan, goalId, data.to as AbaGoalStatus, data.reason, sessionsOf(planId), user, now())
    putPlan(next)
    audit(user, "status_change", "aba_plan", planId, "Alterou situação de objetivo ABA")
    commit()
    return next
  },

  async activatePlan(id: string) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const plan = findPlan(id)
    const patient = requireClinical(user, plan.patientId, "write")
    const next = activatePlan(plan, user, now())
    putPlan(next)
    audit(user, "status_change", "aba_plan", id, "Ativou plano ABA")
    commit()
    return next
  },

  async closePlan(id: string, input: ReasonInput) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const plan = findPlan(id)
    const patient = requireClinical(user, plan.patientId, "write")
    const data = parse<ReasonInput>(reasonSchema, input)
    const next = closePlan(plan, data.reason, user, now())
    putPlan(next)
    audit(user, "status_change", "aba_plan", id, "Encerrou plano ABA")
    commit()
    return next
  },

  async recordSession(input: AbaSessionInput) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const data = parse<AbaSessionInput>(abaSessionSchema, input)
    const plan = findPlan(data.planId)
    const patient = requireClinical(user, plan.patientId, "write")
    if (!user.professionalId) throw new ForbiddenError("Somente profissionais registram sessões.")
    const measures = data.measures.map((m) => ({ goalId: m.goalId, trials: m.trials, correct: m.correct, note: m.note || undefined }))
    validateSession(plan, { date: data.date, measures }, clinicDateKey(new Date()))
    const at = now()
    const session: AbaSession = {
      id: uid("se"),
      planId: plan.id,
      patientId: plan.patientId,
      date: data.date,
      professionalId: user.professionalId,
      authorId: user.id,
      authorName: user.name,
      measures,
      notes: data.notes || undefined,
      createdAt: at,
    }
    getDB().abaSessions.push(session)
    putPlan(sessionLog(plan, `Sessão de ${data.date.split("-").reverse().join("/")} registrada`, user, at))
    audit(user, "create", "aba_session", session.id, "Registrou sessão ABA")
    commit()
    return session
  },

  async voidSession(sessionId: string, input: ReasonInput) {
    await simulateLatency()
    const user = actor()
    assertClinicalPermission(user, "write")
    const db = getDB()
    const session = db.abaSessions.find((s) => s.id === sessionId)
    if (!session) throw new NotFoundError("Sessão não encontrada.")
    const patient = requireClinical(user, session.patientId, "write")
    const data = parse<ReasonInput>(reasonSchema, input)
    const plan = findPlan(session.planId)
    if (plan.status === "closed") throw new ValidationError("Plano encerrado é somente leitura.")
    const at = now()
    const voided = voidSession(session, data.reason, user, at)
    db.abaSessions[db.abaSessions.findIndex((s) => s.id === sessionId)] = voided
    putPlan(sessionLog(plan, `Sessão de ${session.date.split("-").reverse().join("/")} anulada`, user, at))
    audit(user, "update", "aba_session", sessionId, "Anulou sessão ABA")
    commit()
    return voided
  },
}

export type AbaPlanView = ReturnType<typeof planView>
