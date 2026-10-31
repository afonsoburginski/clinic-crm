export type AppointmentData = Record<string, unknown>
export interface AppointmentFilters { from?: string; to?: string; professional?: string; status?: string; patient?: string }
export interface SchedulingRepository {
  list(clinic: string, filters: AppointmentFilters): Promise<AppointmentData[]>
  create(clinic: string, input: AppointmentData): Promise<AppointmentData | undefined>
  get(clinic: string, id: string, professional?: string): Promise<AppointmentData | undefined>
  update(clinic: string, id: string, input: AppointmentData, statusFor: (current: AppointmentUpdateState) => string): Promise<AppointmentData | undefined>
  getStatus(clinic: string, id: string): Promise<string | undefined>
  listForPatient(clinic: string, patient: string): Promise<AppointmentData[]>
  hasConflict(clinic: string, professional: string | undefined, start: string, end: string, room: string | undefined): Promise<boolean>
}

export interface AppointmentUpdateState { status: string; professionalId: string | null; patientId: string | null }
