import { createTablePreferenceUseCases } from "@/application/use-cases/table-preferences"
import { postgresTablePreferences } from "@/infrastructure/postgres/repositories/table-preferences"

export const tablePreferences = createTablePreferenceUseCases(postgresTablePreferences)
