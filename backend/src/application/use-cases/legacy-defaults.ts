/**
 * Rules of the ABA, financial and document use cases that are kept exactly as the generic
 * resource service had them. Each one is a known gap, isolated here so it can be changed in one place.
 */

/** A client-sent `status` or `createdBy` is honored; only a missing one is defaulted. */
export function withLegacyCreationDefaults(payload: Record<string, unknown>, actorId: string): Record<string, unknown> {
  return { ...payload, createdBy: payload.createdBy ?? actorId, status: payload.status ?? "draft" }
}
