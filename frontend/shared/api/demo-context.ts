import { ForbiddenError, ValidationError } from "@/domain/errors"
import { can, clinicalPatientIds, type Permission } from "@/domain/permissions"
import type { AuditEntry, User } from "@/domain/types"
import { commit, getDB, uid } from "@/shared/lib/demo-db"
import { useSessionStore } from "@/shared/lib/session-store"

/** Helpers comuns dos adaptadores demo (`demo-api.ts`, `demo-clinical.ts`, …). */

/** Usuário da sessão real (snapshot da API); sem ele, cai nos usuários do seed demo. */
export function actor(): User {
  const { userId, user: sessionUser } = useSessionStore.getState()
  const user = sessionUser ?? getDB().users.find((u) => u.id === userId)
  if (!user) throw new ForbiddenError("Sua sessão expirou. Entre novamente.")
  return user
}

export function requirePermission(user: User, permission: Permission) {
  if (!can(user, permission)) throw new ForbiddenError()
}

export function blankToUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj }
  for (const key of Object.keys(out)) {
    if (out[key] === "") (out as Record<string, unknown>)[key] = undefined
  }
  return out
}

export function diff(before: object, after: object) {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  const b = before as Record<string, unknown>
  const a = after as Record<string, unknown>
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (key === "updatedAt") continue
    if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) changes[key] = { from: b[key], to: a[key] }
  }
  return changes
}

/**
 * Recursos clínicos e de documentos: a auditoria registra o fato (quem, quando, qual ação),
 * nunca nome de paciente, título nem conteúdo (RN-PRN-008, RN-DOC-007, RN-CFG-003).
 */
const CLINICAL_AUDIT_NOUNS: Record<string, string> = {
  clinical_record: "registro de prontuário",
  assessment: "avaliação clínica",
  aba_plan: "plano ABA",
  aba_session: "sessão ABA",
  document: "documento",
  document_release: "liberação de documento",
}

const AUDIT_VERBS: Record<string, string> = {
  create: "Criou",
  update: "Alterou",
  status_change: "Alterou a situação de",
  read: "Consultou",
  delete: "Removeu",
}

const clinicalNoun = (resource: string) =>
  Object.prototype.hasOwnProperty.call(CLINICAL_AUDIT_NOUNS, resource) ? CLINICAL_AUDIT_NOUNS[resource] : undefined

export function audit(
  user: User,
  action: string,
  resource: string,
  resourceId: string,
  summary: string,
  changes?: Record<string, { from: unknown; to: unknown }>
) {
  getDB().audit.unshift({
    id: uid("au"),
    at: new Date().toISOString(),
    actorId: user.id,
    actorName: user.name,
    action,
    resource,
    resourceId,
    summary,
    // Diff de campo clínico carregaria conteúdo: recursos clínicos nunca gravam `changes`.
    changes: !clinicalNoun(resource) && changes && Object.keys(changes).length ? changes : undefined,
  })
}

const READ_AUDIT_WINDOW_MS = 60_000

/**
 * Leitura clínica auditada sem PII: `resourceId` é só um identificador opaco. A mesma leitura
 * pelo mesmo ator dentro da janela vira um único registro, para recargas não encherem a trilha.
 */
export function auditRead(user: User, resource: string, resourceId: string, summary: string) {
  const db = getDB()
  const cutoff = Date.now() - READ_AUDIT_WINDOW_MS
  const repeated = db.audit
    .slice(0, 50)
    .some(
      (e) =>
        e.action === "read" &&
        e.actorId === user.id &&
        e.resource === resource &&
        e.resourceId === resourceId &&
        new Date(e.at).getTime() > cutoff
    )
  if (repeated) return
  audit(user, "read", resource, resourceId, summary)
  commit()
}

/** Entradas antigas de recursos clínicos podem trazer nome ou título: a listagem devolve só o fato. */
export function redactClinicalAudit(entry: AuditEntry): AuditEntry {
  const noun = clinicalNoun(entry.resource)
  if (!noun) return entry
  return { ...entry, summary: `${AUDIT_VERBS[entry.action] ?? "Registrou ação em"} ${noun}`, changes: undefined }
}

export function parse<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } },
  input: unknown
): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new ValidationError(result.error?.issues[0]?.message ?? "Dados inválidos")
  return result.data as T
}

/** Pacientes que um profissional pode acessar clinicamente (RN-PRN-001); inativo ou inexistente não alcança ninguém. */
export function patientIdsOf(professionalId: string | undefined) {
  const db = getDB()
  // Sem vínculo profissional não há "pacientes próprios" (evita casar `undefined === undefined`).
  const professional = professionalId ? db.professionals.find((p) => p.id === professionalId) : undefined
  return clinicalPatientIds(professional, db.appointments, db.patients)
}

export function ownPatientIds(user: User) {
  return patientIdsOf(user.professionalId)
}

export function canReadPatient(user: User, patientId: string) {
  if (can(user, "patients:read")) return true
  return can(user, "patients:read-own") && ownPatientIds(user).has(patientId)
}

export const now = () => new Date().toISOString()
