import { and, asc, eq, ne, sql } from "drizzle-orm"
import type {
  SaveTableViewCommand,
  SaveTableViewResult,
  TablePreferenceRepository,
  TableScope,
  TableViewRecord,
} from "@/application/ports/table-preferences"
import { DEFAULT_VIEW, type FilterValue, type SortRule } from "@/domain/table-preferences"
import { db, type Database } from "@/infrastructure/postgres/drizzle"
import { userTablePreferences as views } from "@/infrastructure/postgres/schema"

/** Both the database and an open transaction run these queries. */
export type Executor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">

type ViewRow = typeof views.$inferSelect

const scoped = (scope: TableScope) =>
  and(eq(views.clinicId, scope.clinicId), eq(views.userId, scope.userId), eq(views.tableKey, scope.tableKey))

// ------------------------------------------------------------------ queries (built, not run, so tests can read their SQL)

/** The `default` working preferences first, then the saved views by name. */
export const listViewsQuery = (executor: Executor, scope: TableScope) =>
  executor
    .select()
    .from(views)
    .where(scoped(scope))
    .orderBy(sql`(${views.viewName} <> ${DEFAULT_VIEW})`, asc(sql`lower(${views.viewName})`))

export const countOtherViewsQuery = (executor: Executor, scope: TableScope, name: string) =>
  executor
    .select({ total: sql<number>`count(*)::int` })
    .from(views)
    .where(and(scoped(scope), ne(views.viewName, name)))

export const unmarkDefaultQuery = (executor: Executor, scope: TableScope, name: string) =>
  executor
    .update(views)
    .set({ isDefault: false })
    .where(and(scoped(scope), eq(views.isDefault, true), ne(views.viewName, name)))

export const deleteViewQuery = (executor: Executor, scope: TableScope, name: string) =>
  executor
    .delete(views)
    .where(and(scoped(scope), eq(views.viewName, name)))
    .returning({ name: views.viewName })

function toRecord(row: ViewRow): TableViewRecord {
  return {
    name: row.viewName,
    pageSize: row.pageSize,
    sort: row.sort as SortRule[],
    hiddenColumns: row.hiddenColumns as string[],
    columnOrder: row.columnOrder as string[],
    filters: row.filters as Record<string, FilterValue>,
    isDefault: row.isDefault,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function createPostgresTablePreferences(database: () => Database): TablePreferenceRepository {
  return {
    async list(scope) {
      return (await listViewsQuery(database(), scope)).map(toRecord)
    },

    /** One transaction per user and table: the view limit and the single initial view hold under concurrent saves. */
    save(command: SaveTableViewCommand): Promise<SaveTableViewResult> {
      const { scope, name, view, maxViews } = command
      return database().transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`table-preferences:${scope.clinicId}:${scope.userId}:${scope.tableKey}`}))`,
        )
        const [{ total }] = await countOtherViewsQuery(tx, scope, name)
        const [existing] = await tx
          .select({ name: views.viewName })
          .from(views)
          .where(and(scoped(scope), eq(views.viewName, name)))
          .limit(1)
        if (!existing && total >= maxViews) return { outcome: "limit_reached" }
        if (view.isDefault) await unmarkDefaultQuery(tx, scope, name)
        const values = {
          pageSize: view.pageSize,
          sort: view.sort,
          hiddenColumns: view.hiddenColumns,
          columnOrder: view.columnOrder,
          filters: view.filters,
          isDefault: view.isDefault,
          updatedAt: new Date(),
        }
        const [saved] = await tx
          .insert(views)
          .values({ ...scope, viewName: name, ...values })
          .onConflictDoUpdate({ target: [views.clinicId, views.userId, views.tableKey, views.viewName], set: values })
          .returning()
        return { outcome: "saved", view: toRecord(saved) }
      })
    },

    async remove(scope, name) {
      return (await deleteViewQuery(database(), scope, name)).length > 0
    },
  }
}

export const postgresTablePreferences = createPostgresTablePreferences(db)
