export interface AppointmentTransitionTransaction {
  getStatus(clinicId: string, appointmentId: string): Promise<string | null>
  setStatus(clinicId: string, appointmentId: string, status: string): Promise<AppointmentTransitionResult>
}

export interface AppointmentTransitionResult {
  id: string
  status: string
}

export interface AppointmentTransitionRepository {
  transaction<T>(work: (transaction: AppointmentTransitionTransaction) => Promise<T>): Promise<T>
}
