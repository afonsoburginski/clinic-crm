import { describe, expect, test } from "bun:test"
import { drizzle } from "drizzle-orm/node-postgres"
import * as schema from "@/infrastructure/postgres/schema"
import {
  countOtherViewsQuery,
  deleteViewQuery,
  listViewsQuery,
  unmarkDefaultQuery,
  type Executor,
} from "@/infrastructure/postgres/repositories/table-preferences"

/** No connection: the query builders only render SQL. */
const executor = drizzle.mock({ schema }) as unknown as Executor
const scope = { clinicId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", tableKey: "financial-entries" }

describe("table preference queries (SQL rendered by Drizzle)", () => {
  test("every query is scoped by clinic, user and table", () => {
    for (const built of [
      listViewsQuery(executor, scope),
      countOtherViewsQuery(executor, scope, "x"),
      unmarkDefaultQuery(executor, scope, "x"),
      deleteViewQuery(executor, scope, "x"),
    ]) {
      const { sql, params } = built.toSQL()
      for (const column of ["clinic_id", "user_id", "table_key"]) expect(sql).toMatch(new RegExp(`"${column}" = \\$\\d`))
      const at = params.indexOf(scope.clinicId)
      expect(params.slice(at, at + 3)).toEqual([scope.clinicId, scope.userId, scope.tableKey])
    }
  })

  test("the listing puts the default preferences first, then saved views by name", () => {
    const { sql, params } = listViewsQuery(executor, scope).toSQL()
    expect(sql).toContain('order by ("user_table_preferences"."view_name" <> $4), lower("user_table_preferences"."view_name")')
    expect(params[3]).toBe("default")
  })

  test("un-marking the initial view only touches the other views flagged as initial", () => {
    const { sql } = unmarkDefaultQuery(executor, scope, "Pendentes").toSQL()
    expect(sql).toContain('"is_default" = $1')
    expect(sql).toContain('"is_default" = $5')
    expect(sql).toContain('"view_name" <> $6')
  })

  test("deleting names the view and returns what it removed", () => {
    const { sql, params } = deleteViewQuery(executor, scope, "Pendentes").toSQL()
    expect(sql).toContain('delete from "user_table_preferences"')
    expect(sql).toContain('"view_name" = $4')
    expect(sql).toContain("returning")
    expect(params[3]).toBe("Pendentes")
  })

  test("the migration file matches the table: keys, checks and the single initial view index", async () => {
    const migration = await Bun.file(new URL("../migrations/007_table_preferences.sql", import.meta.url)).text()
    expect(migration).toContain("PRIMARY KEY (clinic_id, user_id, table_key, view_name)")
    expect(migration).toContain("table_key ~ '^[a-z0-9-]{1,60}$'")
    expect(migration).toContain("ON DELETE CASCADE")
    expect(migration).toContain("WHERE is_default")
    expect(migration).not.toContain("INSERT INTO")
  })
})
