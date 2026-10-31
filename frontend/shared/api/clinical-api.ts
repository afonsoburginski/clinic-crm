import { clinicDateKey } from "@/domain/clinic-time"
import {
  activatePlan,
  closePlan,
  createPlan,
  goalProgress,
  measurePercent,
  saveGoal,
  sessionLog,
  setGoalStatus,
  updatePlan,
  validateSession,
  voidSession,
} from "@/domain/aba"
import { addInterpretation, assertResponsibleOperable, cancelAssessment, completeAssessment, createAssessment, setStageStatus } from "@/domain/assessment"
import { editDraft, finalizeDraft, startRectification } from "@/domain/clinical-record"
import { activeReleases } from "@/domain/documents"
import { ForbiddenError, ValidationError } from "@/domain/errors"
import { clinicalPatientIds } from "@/domain/permissions"
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
  AbaChange,
  AbaPlan,
  AbaPlanStatus,
  AbaSession,
  AssessmentStageStatus,
  AssessmentStatus,
  ClinicalRecord,
  ClinicalRecordKind,
} from "@/domain/types"

import { listOf, text, toAppointment, toPatient, toProfessional, type Row } from "./backend-mappers"
import {
  goalToStored,
  recordTypeOf,
  stageStatusToStored,
  toAbaPlan,
  toAbaSession,
  toAssessment,
  toClinicalRecord,
  toClinicalRecords,
} from "./clinical-mappers"
import { toPatientDocument } from "./document-mappers"
import { currentUser, items, now, parse, seg, uid, whenForbidden } from "./helpers"
import { http } from "./http-client"
import { loadPatients } from "./patient-directory"

// RN-PRN-001/002: a API decide o acesso (permissão clínica + vínculo com o paciente). Aqui rodam só as
// regras de domínio que dão mensagem clara antes da chamada e a tradução de formato.

const NO_ACCESS = "Seu perfil não tem acesso a dados clínicos."
const NO_PATIENT_ACCESS = "Você não tem acesso ao prontuário deste paciente."

const clinicalErrors = (notFound: string) => ({ 403: NO_PATIENT_ACCESS, 404: notFound })

async function clinicalItems(path: string, query?: Record<string, string | undefined>) {
  const body = await http.get<{ items?: Row[] }>(path, { query, errors: { 403: NO_ACCESS } })
  return body.items ?? []
}

const newestFirst = <T>(list: T[], key: (item: T) => string) => [...list].sort((a, b) => key(b).localeCompare(key(a)))
const nonEmpty = (value: string | undefined) => value || undefined
const brDate = (date: string) => date.split("-").reverse().join("/")

/**
 * RN-AVA-001: o responsável precisa estar ativo e vinculado ao paciente. Perfis que não leem o catálogo
 * (a API restringe `/professionals`) seguem sem a pré-checagem; valem as respostas do servidor.
 */
async function requireResponsible(professionalId: string, patientId: string) {
  const professional = await http
    .get<Row>(`/professionals/${seg(professionalId)}`)
    .then(toProfessional)
    .catch(whenForbidden(null))
  if (!professional) return
  const [patient, appointmentRows] = await Promise.all([
    http.get<Row>(`/patients/${seg(patientId)}`, { errors: { 404: "Paciente não encontrado." } }).then(toPatient),
    items(`/patients/${seg(patientId)}/appointments`),
  ])
  const appointments = appointmentRows.map((row) => toAppointment(row, { patientId }))
  assertResponsibleOperable({
    active: professional.active,
    // A API ainda não expõe a lista de contas: a conta clínica do responsável é validada no servidor.
    hasClinicalAccount: true,
    linkedToPatient: clinicalPatientIds(professional, appointments, [patient]).has(patientId),
  })
}

/** RN-PRN-009: a evolução só vincula atendimento do próprio paciente e profissional. */
async function linkedAppointmentId(professionalId: string | undefined, patientId: string, data: ClinicalRecordInput) {
  if (data.kind !== "evolution" || !data.appointmentId) return undefined
  const rows = await items(`/patients/${seg(patientId)}/appointments`)
  const appointment = rows.map((row) => toAppointment(row, { patientId })).find((a) => a.id === data.appointmentId)
  if (!appointment || appointment.professionalId !== professionalId) {
    throw new ValidationError("O atendimento informado não pertence a este paciente e profissional.")
  }
  return appointment.id
}

// ---------------------------------------------------------------- prontuário

async function fetchRecord(id: string) {
  const row = await http.get<Row>(`/clinical-records/${seg(id)}`, { errors: clinicalErrors("Registro não encontrado.") })
  // Só uma retificação precisa da cadeia para saber a raiz; o registro original é a própria raiz.
  if (!row.parentId) return toClinicalRecord(row)
  const chain = toClinicalRecords(await clinicalItems(`/clinical-records/${seg(id)}/versions`))
  return chain.find((r) => r.id === id) ?? toClinicalRecord(row)
}

async function fetchVersions(id: string) {
  const chain = toClinicalRecords(
    await http.get<{ items?: Row[] }>(`/clinical-records/${seg(id)}/versions`, { errors: clinicalErrors("Registro não encontrado.") }).then((b) => b.items ?? [])
  )
  return chain.sort((a, b) => a.version - b.version)
}

/** RN-PRN-010 / RN-DOC-006: documento ligado a um registro retificado precisa ser liberado de novo. */
async function revokeLinkedReleases(record: ClinicalRecord) {
  const documents = (await items("/documents", { patientId: record.patientId }))
    .map((row) => toPatientDocument(row))
    .filter((doc) => doc.clinicalRecordId === record.rootId)
  try {
    for (const doc of documents) {
      for (const release of activeReleases(doc)) {
        await http.post(`/documents/${seg(doc.id)}/releases/${seg(release.id)}/revoke`, { body: { reason: "Registro clínico retificado" } })
      }
    }
  } catch {
    throw new ValidationError("Registro finalizado, mas não foi possível revogar as liberações dos documentos vinculados. Revogue-as manualmente.")
  }
}

export const clinicalRecordsApi = {
  /** Pacientes do profissional com o resumo do prontuário de cada um. */
  async patients() {
    const [patients, rows] = await Promise.all([loadPatients(), clinicalItems("/clinical/patients")])
    const records = toClinicalRecords(rows)
    return patients
      .map((patient) => {
        const own = records.filter((r) => r.patientId === patient.id)
        return {
          patient,
          total: own.length,
          drafts: own.filter((r) => r.status === "draft").length,
          lastAt: own.map((r) => r.updatedAt).sort().at(-1),
        }
      })
      .sort((a, b) => a.patient.fullName.localeCompare(b.patient.fullName, "pt-BR"))
  },

  async list(patientId: string, filters: { kind?: ClinicalRecordKind | "all" } = {}) {
    const rows = await http
      .get<{ items?: Row[] }>("/clinical-records", { query: { patientId }, errors: { 403: NO_PATIENT_ACCESS } })
      .then((body) => body.items ?? [])
    return newestFirst(
      toClinicalRecords(rows).filter((r) => !filters.kind || filters.kind === "all" || r.kind === filters.kind),
      (r) => r.createdAt
    )
  },

  get: fetchRecord,

  versions: fetchVersions,

  async create(patientId: string, input: ClinicalRecordInput) {
    const user = currentUser()
    if (!user.professionalId) throw new ForbiddenError("Somente profissionais de saúde registram prontuário.")
    const data = parse<ClinicalRecordInput>(clinicalRecordSchema, input)
    const appointmentId = await linkedAppointmentId(user.professionalId, patientId, data)
    const at = now()
    const created = await http.post<Row>("/clinical-records", {
      body: {
        patientId,
        type: recordTypeOf(data.kind),
        title: data.title,
        content: data.content,
        appointmentId,
        authorName: user.name,
        professionalId: user.professionalId,
        createdAt: at,
        updatedAt: at,
      },
      errors: clinicalErrors("Paciente não encontrado."),
    })
    return toClinicalRecord(created)
  },

  async update(id: string, input: ClinicalRecordInput) {
    const user = currentUser()
    const record = await fetchRecord(id)
    const data = parse<ClinicalRecordInput>(clinicalRecordSchema, { ...input, kind: record.kind })
    const appointmentId = await linkedAppointmentId(user.professionalId, record.patientId, data)
    const at = now()
    const next = editDraft(record, { title: data.title, content: data.content, appointmentId }, user, at)
    const saved = await http.patch<Row>(`/clinical-records/${seg(id)}`, {
      body: { title: next.title, content: next.content, appointmentId: next.appointmentId ?? null, updatedAt: at },
      errors: { ...clinicalErrors("Registro não encontrado."), 409: "Registros finalizados não podem ser editados. Use a retificação." },
    })
    return toClinicalRecord(saved, { rootId: record.rootId })
  },

  async finalize(id: string) {
    const user = currentUser()
    const record = await fetchRecord(id)
    const at = now()
    const original = record.rectifiesId ? await fetchRecord(record.rectifiesId) : undefined
    const { superseded } = finalizeDraft(record, user, at, original)
    // A API não guarda quando o registro foi finalizado: o carimbo vai no rascunho, antes de finalizar.
    await http.patch(`/clinical-records/${seg(id)}`, { body: { finalizedAt: at, updatedAt: at }, errors: clinicalErrors("Registro não encontrado.") })
    const finalized = toClinicalRecord(
      await http.post<Row>(`/clinical-records/${seg(id)}/finalize`, {
        body: {},
        errors: { ...clinicalErrors("Registro não encontrado."), 409: "Somente rascunhos podem ser finalizados." },
      }),
      { rootId: record.rootId }
    )
    if (superseded) await revokeLinkedReleases(finalized)
    return finalized
  },

  async rectify(id: string, input: RectificationInput) {
    const user = currentUser()
    const original = await fetchRecord(id)
    const data = parse<RectificationInput>(rectificationSchema, input)
    const at = now()
    startRectification(original, await fetchVersions(id), { id: "pending", reason: data.reason }, user, at)
    const created = await http.post<Row>(`/clinical-records/${seg(id)}/rectifications`, {
      body: { reason: data.reason },
      errors: clinicalErrors("Registro não encontrado."),
    })
    // A nova versão herda os campos do original; autoria e datas passam a ser da retificação.
    const draft = await http.patch<Row>(`/clinical-records/${seg(text(created.id))}`, {
      body: { createdAt: at, updatedAt: at, finalizedAt: null, authorName: user.name },
    })
    return toClinicalRecord(draft, { rootId: original.rootId })
  },
}

// ---------------------------------------------------------------- avaliações

async function fetchAssessment(id: string) {
  return toAssessment(await http.get<Row>(`/assessments/${seg(id)}`, { errors: clinicalErrors("Avaliação não encontrada.") }))
}

export const assessmentsApi = {
  async list(filters: { patientId?: string; status?: AssessmentStatus | "all" } = {}) {
    const rows = await clinicalItems("/assessments", {
      patientId: filters.patientId,
      status: filters.status && filters.status !== "all" ? filters.status : undefined,
    })
    return newestFirst(rows.map((row) => toAssessment(row)), (a) => a.createdAt)
  },

  get: fetchAssessment,

  async create(input: AssessmentInput) {
    const user = currentUser()
    const data = parse<AssessmentInput>(assessmentSchema, input)
    await requireResponsible(data.responsibleProfessionalId, data.patientId)
    const at = now()
    const draft = createAssessment({ id: "pending", ...data }, () => uid("st"), user, at)
    const created = await http.post<Row>("/assessments", {
      body: {
        patientId: draft.patientId,
        title: draft.title,
        purpose: draft.purpose,
        responsibleProfessionalId: draft.responsibleProfessionalId,
        status: "in_progress",
        stages: draft.stages.map((stage) => ({ id: stage.id, name: stage.name, status: "pending" })),
        createdByName: user.name,
        createdAt: at,
        updatedAt: at,
      },
      errors: clinicalErrors("Paciente não encontrado."),
    })
    return toAssessment(created)
  },

  async setStage(id: string, stageId: string, to: AssessmentStageStatus) {
    const user = currentUser()
    const assessment = await fetchAssessment(id)
    const at = now()
    setStageStatus(assessment, stageId, to, user, at)
    const advanced = await http.post<Row>(`/assessments/${seg(id)}/stages`, {
      body: { stageId, status: stageStatusToStored(to) },
      errors: { ...clinicalErrors("Avaliação não encontrada."), 409: "Não é possível mudar a etapa para essa situação." },
    })
    if (to !== "done") return toAssessment(advanced)
    // A API guarda só a situação da etapa; a data de conclusão acompanha a etapa no recurso.
    const stages = listOf(advanced.stages).map((stage) => (stage.id === stageId ? { ...stage, doneAt: at } : stage))
    return toAssessment(await http.patch<Row>(`/assessments/${seg(id)}`, { body: { patientId: assessment.patientId, stages } }))
  },

  async saveInterpretation(id: string, input: InterpretationInput) {
    const user = currentUser()
    const assessment = await fetchAssessment(id)
    const data = parse<InterpretationInput>(interpretationSchema, input)
    addInterpretation(assessment, data.text, "pending", user, now())
    return toAssessment(
      await http.post<Row>(`/assessments/${seg(id)}/interpretations`, {
        body: { content: data.text },
        errors: clinicalErrors("Avaliação não encontrada."),
      })
    )
  },

  async complete(id: string) {
    const user = currentUser()
    completeAssessment(await fetchAssessment(id), user, now())
    return toAssessment(
      await http.post<Row>(`/assessments/${seg(id)}/complete`, {
        body: {},
        errors: { ...clinicalErrors("Avaliação não encontrada."), 409: "Conclua todas as etapas e registre uma interpretação antes de finalizar." },
      })
    )
  },

  async cancel(id: string, input: ReasonInput) {
    const user = currentUser()
    const data = parse<ReasonInput>(reasonSchema, input)
    cancelAssessment(await fetchAssessment(id), data.reason, user, now())
    return toAssessment(
      await http.post<Row>(`/assessments/${seg(id)}/cancel`, {
        body: { reason: data.reason },
        errors: clinicalErrors("Avaliação não encontrada."),
      })
    )
  },
}

// ---------------------------------------------------------------- ABA

/** Plano e sessões do plano; `voided*` das sessões vem do histórico do plano (a API só marca `voided`). */
async function fetchPlan(id: string) {
  const raw = await http.get<Row>(`/aba/plans/${seg(id)}`, { errors: clinicalErrors("Plano não encontrado.") })
  const plan = toAbaPlan(raw)
  const voidedAt = new Map(
    listOf(raw.changeLog)
      .filter((entry) => typeof entry.voidedSessionId === "string")
      .map((entry) => [text(entry.voidedSessionId), entry] as const)
  )
  const sessions = (await clinicalItems("/aba/sessions", { patientId: plan.patientId }))
    .filter((row) => row.planId === plan.id)
    .map((row) => toAbaSession(row))
    .map((session): AbaSession => {
      const entry = voidedAt.get(session.id)
      return session.voidedAt && entry ? { ...session, voidedAt: text(entry.at), voidedBy: text(entry.actorId) || session.voidedBy } : session
    })
  return { raw, plan, sessions }
}

/** Progresso calculado só das medidas registradas (RN-ABA-004). */
function planView(plan: AbaPlan, sessions: AbaSession[]) {
  return {
    plan,
    sessions: [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    progress: plan.goals.map((g) => goalProgress(g, sessions)),
  }
}

/** O histórico do plano só recebe acréscimos: a entrada nova é gravada junto do recurso. */
async function appendChange(raw: Row, plan: AbaPlan, entry: AbaChange, extra: Record<string, unknown> = {}) {
  return http.patch<Row>(`/aba/plans/${seg(plan.id)}`, {
    body: { patientId: plan.patientId, title: plan.title, changeLog: [...listOf(raw.changeLog), { ...entry, ...extra }], updatedAt: entry.at },
    errors: clinicalErrors("Plano não encontrado."),
  })
}

const lastEntry = (plan: AbaPlan) => plan.changeLog[plan.changeLog.length - 1]

export const abaApi = {
  async listPlans(filters: { patientId?: string; status?: AbaPlanStatus | "all" } = {}) {
    const rows = await clinicalItems("/aba/plans", {
      patientId: filters.patientId,
      status: filters.status && filters.status !== "all" ? filters.status : undefined,
    })
    return newestFirst(rows.map(toAbaPlan), (p) => p.createdAt)
  },

  async getPlan(id: string) {
    const { plan, sessions } = await fetchPlan(id)
    return planView(plan, sessions)
  },

  async createPlan(input: AbaPlanInput) {
    const user = currentUser()
    const data = parse<AbaPlanInput>(abaPlanSchema, input)
    await requireResponsible(data.responsibleProfessionalId, data.patientId)
    const at = now()
    const plan = createPlan({ id: "pending", ...data, reviewDate: nonEmpty(data.reviewDate) }, user, at)
    const created = await http.post<Row>("/aba/plans", {
      body: {
        patientId: plan.patientId,
        title: plan.title,
        startDate: plan.startDate,
        reviewDate: plan.reviewDate,
        responsibleProfessionalId: plan.responsibleProfessionalId,
        status: "draft",
        goals: [],
        changeLog: plan.changeLog,
        createdAt: at,
        updatedAt: at,
      },
      errors: clinicalErrors("Paciente não encontrado."),
    })
    return toAbaPlan(created)
  },

  async updatePlan(id: string, input: AbaPlanInput) {
    const user = currentUser()
    const { raw, plan } = await fetchPlan(id)
    const data = parse<AbaPlanInput>(abaPlanSchema, input)
    await requireResponsible(data.responsibleProfessionalId, plan.patientId)
    const at = now()
    const next = updatePlan(
      plan,
      { title: data.title, startDate: data.startDate, reviewDate: nonEmpty(data.reviewDate), responsibleProfessionalId: data.responsibleProfessionalId },
      user,
      at
    )
    const saved = await http.patch<Row>(`/aba/plans/${seg(id)}`, {
      body: {
        patientId: plan.patientId,
        title: next.title,
        startDate: next.startDate,
        reviewDate: next.reviewDate ?? null,
        responsibleProfessionalId: next.responsibleProfessionalId,
        changeLog: [...listOf(raw.changeLog), lastEntry(next)],
        updatedAt: at,
      },
      errors: { ...clinicalErrors("Plano não encontrado."), 409: "Plano encerrado é somente leitura." },
    })
    return toAbaPlan(saved)
  },

  async saveGoal(planId: string, input: AbaGoalInput, goalId?: string) {
    const user = currentUser()
    const { raw, plan, sessions } = await fetchPlan(planId)
    const data = parse<AbaGoalInput>(abaGoalSchema, input)
    const fields = { ...data, description: nonEmpty(data.description) }
    const next = saveGoal(plan, fields, goalId, "pending", user, now(), sessions)
    const stored = goalToStored(fields)
    const errors = { ...clinicalErrors("Plano não encontrado."), 409: "Plano encerrado é somente leitura." }
    const changed = goalId
      ? await http.patch<Row>(`/aba/plans/${seg(planId)}/goals/${seg(goalId)}`, { body: stored, errors })
      : await http.post<Row>(`/aba/plans/${seg(planId)}/goals`, { body: stored, errors })
    return toAbaPlan(await appendChange({ ...raw, changeLog: changed.changeLog ?? raw.changeLog }, plan, lastEntry(next)))
  },

  async setGoalStatus(planId: string, goalId: string, input: AbaGoalStatusInput) {
    const user = currentUser()
    const { raw, plan, sessions } = await fetchPlan(planId)
    const data = parse<AbaGoalStatusInput>(abaGoalStatusSchema, input)
    const at = now()
    const next = setGoalStatus(plan, goalId, data.to, data.reason, sessions, user, at)
    // A API não tem rota de situação do objetivo: ela segue no recurso do plano, validada pelas regras de domínio.
    const goals = listOf(raw.goals).map((goal) => {
      const after = next.goals.find((g) => g.id === goal.id)
      return after && after.status !== text(goal.status) ? { ...goal, status: after.status, statusReason: after.statusReason ?? null } : goal
    })
    const saved = await http.patch<Row>(`/aba/plans/${seg(planId)}`, {
      body: { patientId: plan.patientId, title: plan.title, goals, changeLog: [...listOf(raw.changeLog), lastEntry(next)], updatedAt: at },
      errors: { ...clinicalErrors("Plano não encontrado."), 409: "Plano encerrado é somente leitura." },
    })
    return toAbaPlan(saved)
  },

  async activatePlan(id: string) {
    const user = currentUser()
    const { raw, plan } = await fetchPlan(id)
    const next = activatePlan(plan, user, now())
    const activated = await http.post<Row>(`/aba/plans/${seg(id)}/activate`, {
      body: {},
      errors: { ...clinicalErrors("Plano não encontrado."), 409: "Inclua ao menos um objetivo antes de ativar o plano." },
    })
    return toAbaPlan(await appendChange({ ...raw, changeLog: activated.changeLog ?? raw.changeLog }, plan, lastEntry(next)))
  },

  async closePlan(id: string, input: ReasonInput) {
    const user = currentUser()
    const { raw, plan } = await fetchPlan(id)
    const data = parse<ReasonInput>(reasonSchema, input)
    const next = closePlan(plan, data.reason, user, now())
    // Plano encerrado só aceita leitura: motivo e histórico entram antes do encerramento.
    const entry = lastEntry(next)
    await http.patch(`/aba/plans/${seg(id)}`, {
      body: {
        patientId: plan.patientId,
        title: plan.title,
        closeReason: next.closeReason,
        changeLog: [...listOf(raw.changeLog), entry],
        updatedAt: entry.at,
      },
      errors: clinicalErrors("Plano não encontrado."),
    })
    return toAbaPlan(
      await http.post<Row>(`/aba/plans/${seg(id)}/close`, {
        body: { reason: data.reason },
        errors: { ...clinicalErrors("Plano não encontrado."), 409: "Este plano já foi encerrado." },
      })
    )
  },

  async recordSession(input: AbaSessionInput) {
    const user = currentUser()
    const data = parse<AbaSessionInput>(abaSessionSchema, input)
    if (!user.professionalId) throw new ForbiddenError("Somente profissionais registram sessões.")
    const { raw, plan } = await fetchPlan(data.planId)
    const measures = data.measures.map((m) => ({ goalId: m.goalId, trials: m.trials, correct: m.correct, note: nonEmpty(m.note) }))
    validateSession(plan, { date: data.date, measures }, clinicDateKey(new Date()))
    const at = now()
    const created = await http.post<Row>("/aba/sessions", {
      body: {
        planId: plan.id,
        patientId: plan.patientId,
        date: data.date,
        professionalId: user.professionalId,
        authorName: user.name,
        // `percent` é o que a API usa para medir o progresso das metas.
        measures: measures.map((m) => ({ ...m, percent: measurePercent(m) })),
        notes: nonEmpty(data.notes),
        createdAt: at,
      },
      errors: clinicalErrors("Plano não encontrado."),
    })
    const logged = sessionLog(plan, `Sessão de ${brDate(data.date)} registrada`, user, at)
    await appendChange(raw, plan, lastEntry(logged))
    return toAbaSession(created)
  },

  async voidSession(sessionId: string, input: ReasonInput) {
    const user = currentUser()
    const data = parse<ReasonInput>(reasonSchema, input)
    // A API não expõe a sessão por id: ela é localizada na lista a que o usuário tem acesso.
    const row = (await clinicalItems("/aba/sessions")).find((r) => r.id === sessionId)
    if (!row) throw new ValidationError("Sessão não encontrada.")
    const session = toAbaSession(row)
    const { raw, plan } = await fetchPlan(session.planId)
    if (plan.status === "closed") throw new ValidationError("Plano encerrado é somente leitura.")
    const at = now()
    voidSession(session, data.reason, user, at)
    const voided = await http.post<Row>(`/aba/sessions/${seg(sessionId)}/void`, {
      body: { reason: data.reason },
      errors: clinicalErrors("Sessão não encontrada."),
    })
    const logged = sessionLog(plan, `Sessão de ${brDate(session.date)} anulada`, user, at)
    await appendChange(raw, plan, lastEntry(logged), { voidedSessionId: sessionId })
    return toAbaSession(voided)
  },
}

export type AbaPlanView = ReturnType<typeof planView>
