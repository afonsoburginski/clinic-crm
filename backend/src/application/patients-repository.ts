export type PatientInput = Record<string, unknown>;
export type PatientRow = Record<string, unknown> & {
  patient_id?: string;
  guardian_id?: string;
};
export type PatientResult = { rows: PatientRow[]; rowCount: number | null };

export interface PatientsRepository {
  list(clinicId: string, search?: string, professional?: string): Promise<PatientResult>;
  create(clinicId: string, p: PatientInput): Promise<PatientResult>;
  duplicates(clinicId: string, document: string | undefined, birthDate: string | undefined, search: string): Promise<PatientResult>;
  get(clinicId: string, id: string, professional?: string): Promise<PatientResult>;
  update(clinicId: string, id: string, p: PatientInput): Promise<PatientResult>;
  listGuardians(clinicId: string): Promise<PatientResult>;
  createGuardian(clinicId: string, p: PatientInput): Promise<PatientResult>;
  listPatientGuardians(clinicId: string, patientId?: string): Promise<PatientResult>;
  createPatientGuardian(clinicId: string, p: PatientInput): Promise<PatientResult>;
  updatePatientGuardian(clinicId: string, id: string, p: PatientInput): Promise<PatientResult>;
  deletePatientGuardian(clinicId: string, id: string): Promise<PatientResult>;
  revokeReleases(clinicId: string, patientId: string, guardianId: string, actorId: string): Promise<PatientResult>;
}
