import { createPatientUseCases } from "../../application/patients";
import { postgresPatientsRepository } from "../../infrastructure/postgres-patients-repository";

export const patients = createPatientUseCases(postgresPatientsRepository);
