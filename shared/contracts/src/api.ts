export type ApiErrorCode = "validation_error" | "not_found" | "forbidden" | "conflict" | "unauthorized" | "internal_error" | "database_unconfigured"
export interface ApiError { error: { code: ApiErrorCode; message: string; details?: unknown } }
export interface Page<T> { items: T[]; page: number; pageSize: number; total: number }
export interface Resource { id: string; [key: string]: unknown }
export interface SessionUser { id: string; name: string; email: string; roles: string[]; professionalId?: string }
export interface LoginRequest { email: string; password: string }
export interface LoginResponse { user: SessionUser; accessToken: string; expiresAt: string }
export interface SessionResponse { user: SessionUser }
export interface LogoutResponse { ok: true }

export type PatientStatus = "active" | "inactive" | "archived"
export interface PatientRecord {
  id: string; code: string; fullName: string; socialName?: string; birthDate: string; document?: string
  phone?: string; email?: string; status: PatientStatus; mainProfessionalId?: string
  consentData: boolean; consentImage: boolean; administrativeNotes?: string
}
export interface CreatePatientRequest extends Omit<PatientRecord,"id"|"code"> {}
export type AppointmentStatus = "requested"|"pending"|"confirmed"|"in_progress"|"completed"|"cancelled"|"no_show"
export interface AppointmentRecord {
  id: string; kind: "appointment"|"block"; title?: string; patientId?: string; professionalId: string
  serviceId?: string; roomId?: string; start: string; end: string; status: AppointmentStatus; notes?: string
}
export interface CreateAppointmentRequest extends Omit<AppointmentRecord,"id"> { createdBy?: string }
export interface TransitionAppointmentRequest { status: AppointmentStatus; reason?: string }

