import { createAbaUseCases } from "@/application/use-cases/aba";
import { postgresAbaRepository } from "@/infrastructure/postgres/repositories/aba";
import { patientAccess } from "@/presentation/composition/patient-access";

export const aba = createAbaUseCases(postgresAbaRepository, patientAccess);
