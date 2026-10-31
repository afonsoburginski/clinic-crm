export interface ResourceRepository {
  list(clinicId: string, type: string, filters?: Record<string, string | undefined>): Promise<unknown[]>
  get(clinicId: string, type: string, id: string): Promise<unknown>
  save(
    clinicId: string,
    type: string,
    payload: Record<string, unknown>,
    id?: string,
    actorId?: string,
  ): Promise<unknown>
}
