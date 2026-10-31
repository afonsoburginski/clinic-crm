import type { Actor } from "@/application/ports/patient-access"

/** Helpers for reading the untyped JSON payloads kept in `api_resources` (records, assessments, ABA, financial, documents). */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Object bodies only; anything else reads as an empty payload. */
export function fieldsOf(body: unknown): Record<string, unknown> {
  return isRecord(body) ? body : {}
}

export function textLength(value: unknown): number {
  return String(value ?? "").trim().length
}

export function patientIdOf(source: unknown): string | undefined {
  return isRecord(source) && typeof source.patientId === "string" ? source.patientId : undefined
}

/** Copy of `payload` without the given keys. */
export function omit(payload: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !keys.includes(key)))
}

/** Defaults applied to every new record: author, and a draft status that a client-sent `status` never overrides. */
export function withCreationDefaults(payload: Record<string, unknown>, actorId: string): Record<string, unknown> {
  return { ...payload, createdBy: payload.createdBy ?? actorId, status: "draft" }
}

/** A professional without a professional link has no patients: it must never fall back to an unscoped query. */
export function assertLinkedProfessional(actor: Actor): void {
  if (actor.roles.includes("professional") && !actor.professionalId) throw new Error("forbidden")
}

/** List scope: professionals only see their linked patients; other roles are unscoped. */
export function professionalScopeOf(actor: Actor): string | undefined {
  assertLinkedProfessional(actor)
  return actor.roles.includes("professional") ? actor.professionalId : undefined
}

/** State-changing actions never run for an anonymous or the internal `system` caller. */
export function assertAuthenticated(actor: Actor): void {
  if (!actor.userId || actor.userId === "system") throw new Error("unauthorized")
}
