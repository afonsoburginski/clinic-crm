import type { PatientAccessPolicy } from "@/application/ports/patient-access";
import { assertProfessionalPatientAccess } from "@/presentation/routes/shared";

export const patientAccess: PatientAccessPolicy = {
  assertAccess: (patientId, actor) => assertProfessionalPatientAccess(patientId, actor),
};
