import { createFinancialUseCases } from "@/application/use-cases/financial";
import { postgresFinancialRepository } from "@/infrastructure/postgres/repositories/financial";

export const financial = createFinancialUseCases(postgresFinancialRepository);
