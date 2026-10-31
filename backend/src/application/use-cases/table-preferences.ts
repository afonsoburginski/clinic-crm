import { DomainError } from "@/application/errors"
import type { Actor } from "@/application/ports/patient-access"
import type { TablePreferenceRepository, TableScope, TableViewRecord } from "@/application/ports/table-preferences"
import { assertAuthenticated } from "@/application/use-cases/clinical-payload"
import { MAX_VIEWS_PER_TABLE, parseTableKey, parseViewInput, parseViewName, type Parsed } from "@/domain/table-preferences"

export interface TableQueryInput { clinicId: string; actor: Actor; tableKey: string }
export interface SaveViewInput extends TableQueryInput { viewName: string; body: unknown }
export interface DeleteViewInput extends TableQueryInput { viewName: string }

function valid<T>(parsed: Parsed<T>): T {
  if (!parsed.ok) throw new DomainError("validation", parsed.detail)
  return parsed.value
}

/** The scope is built from the session actor only: there is no way to name another user's preferences. */
function scopeOf(input: TableQueryInput): TableScope {
  assertAuthenticated(input.actor)
  return { clinicId: input.clinicId, userId: input.actor.userId, tableKey: valid(parseTableKey(input.tableKey)) }
}

export function createTablePreferenceQueries(repository: TablePreferenceRepository) {
  return {
    async listViews(input: TableQueryInput): Promise<TableViewRecord[]> {
      return repository.list(scopeOf(input))
    },
  }
}

export function createTablePreferenceCommands(repository: TablePreferenceRepository) {
  return {
    /** Creates or replaces one view; marking it as the initial view unmarks the others of the same table. */
    async saveView(input: SaveViewInput): Promise<TableViewRecord> {
      const scope = scopeOf(input)
      const name = valid(parseViewName(input.viewName))
      const view = valid(parseViewInput(input.body, name))
      const result = await repository.save({ scope, name, view, maxViews: MAX_VIEWS_PER_TABLE })
      if (result.outcome === "limit_reached") {
        throw new DomainError("conflict", `Limite de ${MAX_VIEWS_PER_TABLE} visões salvas por tabela atingido.`)
      }
      return result.view
    },
    async deleteView(input: DeleteViewInput): Promise<{ ok: true }> {
      const scope = scopeOf(input)
      const name = valid(parseViewName(input.viewName))
      if (!(await repository.remove(scope, name))) throw new Error("not_found")
      return { ok: true }
    },
  }
}

export function createTablePreferenceUseCases(repository: TablePreferenceRepository) {
  return { queries: createTablePreferenceQueries(repository), commands: createTablePreferenceCommands(repository) }
}

export type TablePreferenceUseCases = ReturnType<typeof createTablePreferenceUseCases>
