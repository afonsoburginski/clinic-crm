import { createAssessmentUseCases } from "@/application/use-cases/assessments";
import { postgresAssessmentRepository } from "@/infrastructure/postgres/repositories/assessments";
import { patientAccess } from "@/presentation/composition/patient-access";

export const assessments = createAssessmentUseCases(postgresAssessmentRepository, patientAccess);
