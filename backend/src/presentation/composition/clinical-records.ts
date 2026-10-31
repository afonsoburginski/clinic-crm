import { createClinicalRecordUseCases } from "@/application/use-cases/clinical-records";
import { postgresClinicalRecordRepository } from "@/infrastructure/postgres/repositories/clinical-records";
import { patientAccess } from "@/presentation/composition/patient-access";

export const clinicalRecords = createClinicalRecordUseCases(postgresClinicalRecordRepository, patientAccess);
