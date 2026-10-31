import { createDocumentUseCases } from "@/application/use-cases/documents";
import { postgresDocumentRepository } from "@/infrastructure/postgres/repositories/documents";
import { patientAccess } from "@/presentation/composition/patient-access";
import { permissions } from "@/presentation/composition/permissions";

export const documents = createDocumentUseCases(postgresDocumentRepository, patientAccess, permissions);
