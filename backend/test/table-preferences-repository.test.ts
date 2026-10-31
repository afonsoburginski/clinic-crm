import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import type { TablePreferenceRepository } from "@/application/ports/table-preferences"
import { createPostgresTablePreferences } from "@/infrastructure/postgres/repositories/table-preferences"
import * as schema from "@/infrastructure/postgres/schema"

/**
 * Runs against a real PostgreSQL that already has migrations 001–007 applied, e.g.
 * `TEST_DATABASE_URL=postgres://… bun test test/table-preferences-repository.test.ts`. Skipped without it.
 */
const url = Bun.env.TEST_DATABASE_URL

describe.skipIf(!url)("postgres table preferences repository (needs TEST_DATABASE_URL)", () => {
  const clinicIds: string[] = []
  let pool: Pool
  let repository: TablePreferenceRepository

  beforeAll(() => {
    pool = new Pool({ connectionString: url })
    repository = createPostgresTablePreferences(() => drizzle(pool, { schema }))
  })

  afterAll(async () => {
    for (const clinicId of clinicIds) {
      await pool.query("DELETE FROM user_table_preferences WHERE clinic_id = $1", [clinicId])
      await pool.query("DELETE FROM users WHERE clinic_id = $1", [clinicId])
    }
    await pool.end()
  })

  async function newUser() {
    const clinicId = crypto.randomUUID()
    clinicIds.push(clinicId)
    const created = await pool.query<{ id: string }>(
      "INSERT INTO users (clinic_id, name, email, password_hash) VALUES ($1, 'Ana Souza', $2, 'hash') RETURNING id",
      [clinicId, `${clinicId}@clinica.com`],
    )
    return { clinicId, userId: created.rows[0].id, tableKey: "financial-entries" }
  }

  const view = (extra: Partial<{ pageSize: number; isDefault: boolean }> = {}) => ({
    pageSize: extra.pageSize ?? 20,
    sort: [{ id: "dueDate", desc: true }],
    hiddenColumns: ["code"],
    columnOrder: [],
    filters: { status: ["open"] },
    isDefault: extra.isDefault ?? false,
  })

  test("saves, replaces and lists with the default preferences first", async () => {
    const scope = await newUser()
    await repository.save({ scope, name: "Pendentes", view: view(), maxViews: 20 })
    await repository.save({ scope, name: "default", view: view({ pageSize: 50 }), maxViews: 20 })
    const replaced = await repository.save({ scope, name: "Pendentes", view: view({ pageSize: 100 }), maxViews: 20 })
    expect(replaced).toMatchObject({ outcome: "saved", view: { name: "Pendentes", pageSize: 100, filters: { status: ["open"] } } })
    expect((await repository.list(scope)).map((v) => [v.name, v.pageSize])).toEqual([["default", 50], ["Pendentes", 100]])
  })

  test("only one view per table is the initial view, and users do not see each other", async () => {
    const scope = await newUser()
    await repository.save({ scope, name: "A", view: view({ isDefault: true }), maxViews: 20 })
    await repository.save({ scope, name: "B", view: view({ isDefault: true }), maxViews: 20 })
    expect((await repository.list(scope)).filter((v) => v.isDefault).map((v) => v.name)).toEqual(["B"])
    const other = await newUser()
    expect(await repository.list({ ...other, tableKey: scope.tableKey })).toEqual([])
  })

  test("the limit refuses new views and still updates existing ones; remove reports what it deleted", async () => {
    const scope = await newUser()
    await repository.save({ scope, name: "a", view: view(), maxViews: 2 })
    await repository.save({ scope, name: "b", view: view(), maxViews: 2 })
    expect(await repository.save({ scope, name: "c", view: view(), maxViews: 2 })).toEqual({ outcome: "limit_reached" })
    expect((await repository.save({ scope, name: "a", view: view({ pageSize: 10 }), maxViews: 2 })).outcome).toBe("saved")
    expect(await repository.remove(scope, "a")).toBe(true)
    expect(await repository.remove(scope, "a")).toBe(false)
  })
})
