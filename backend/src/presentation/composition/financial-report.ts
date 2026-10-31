import { createFinancialReportUseCases } from "@/application/use-cases/financial-report"
import { permissions } from "@/presentation/composition/permissions"
import { postgresFinancialReport } from "@/infrastructure/postgres/repositories/financial-report"

export const financialReport = createFinancialReportUseCases(postgresFinancialReport, permissions)
