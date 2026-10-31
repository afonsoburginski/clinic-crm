import type { PatientInput, PatientResult, PatientsRepository } from "@/application/patients-repository";

function one(result: PatientResult) {
  if (!result.rowCount) throw new Error("not_found");
  return result.rows[0];
}

export function createPatientUseCases(repository: PatientsRepository) {
  return {
    list: (clinic: string, search?: string, professional?: string) => repository.list(clinic, search, professional),
    async create(clinic: string, p: PatientInput) {
      if (typeof p.fullName !== "string" || p.fullName.trim().length < 3 || typeof p.birthDate !== "string" ||
          p.birthDate > new Date().toISOString().slice(0, 10)) throw new Error("validation");
      return (await repository.create(clinic, p)).rows[0];
    },
    duplicates: (clinic: string, document: string | undefined, birthDate: string | undefined, search: string) =>
      repository.duplicates(clinic, document, birthDate, search),
    async get(clinic: string, id: string, professional?: string) {
      return one(await repository.get(clinic, id, professional));
    },
    async update(clinic: string, id: string, p: PatientInput) {
      const keys = ["fullName", "socialName", "birthDate", "document", "phone", "email", "status", "mainProfessionalId",
        "consentData", "consentImage", "administrativeNotes"];
      if (!keys.some((key) => key in p) ||
          (p.fullName !== undefined && String(p.fullName).trim().length < 3) ||
          (p.birthDate && p.birthDate > new Date().toISOString().slice(0, 10))) throw new Error("validation");
      return one(await repository.update(clinic, id, p));
    },
    listGuardians: (clinic: string) => repository.listGuardians(clinic),
    async createGuardian(clinic: string, p: PatientInput) {
      if (!p.fullName || !p.phone) throw new Error("validation");
      return (await repository.createGuardian(clinic, p)).rows[0];
    },
    listPatientGuardians: (clinic: string, patientId?: string) => repository.listPatientGuardians(clinic, patientId),
    async createPatientGuardian(clinic: string, p: PatientInput) {
      if (!p.patientId || !p.guardianId || !p.relationship) throw new Error("validation");
      return (await repository.createPatientGuardian(clinic, p)).rows[0];
    },
    async updatePatientGuardian(clinic: string, id: string, p: PatientInput) {
      return one(await repository.updatePatientGuardian(clinic, id, p));
    },
    async deletePatientGuardian(clinic: string, id: string, actorId: string) {
      const link = one(await repository.deletePatientGuardian(clinic, id));
      if (!link.patient_id || !link.guardian_id) throw new Error("invalid_repository_result");
      await repository.revokeReleases(clinic, link.patient_id, link.guardian_id, actorId);
      return { ok: true };
    },
  };
}
