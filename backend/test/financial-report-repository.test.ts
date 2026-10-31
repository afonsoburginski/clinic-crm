import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import type { FinancialReportRepository } from "@/application/ports/financial-report"
import { createPostgresFinancialReport } from "@/infrastructure/postgres/repositories/financial-report"
import * as schema from "@/infrastructure/postgres/schema"

/**
 * Runs against a real PostgreSQL that already has migrations 001–008 applied, e.g.
 * `TEST_DATABASE_URL=postgres://… bun test test/financial-report-repository.test.ts`. Skipped without it.
 */
const url = Bun.env.TEST_DATABASE_URL

describe.skipIf(!url)("postgres financial report repository (needs TEST_DATABASE_URL)", () => {
  const clinicIds: string[] = []
  let pool: Pool
  let repository: FinancialReportRepository

  beforeAll(() => {
    pool = new Pool({ connectionString: url })
    repository = createPostgresFinancialReport(() => drizzle(pool, { schema }))
  })

  afterAll(async () => {
    for (const clinicId of clinicIds) {
      await pool.query("DELETE FROM api_resources WHERE clinic_id = $1", [clinicId])
      await pool.query("DELETE FROM audit_events WHERE clinic_id = $1", [clinicId])
    }
    await pool.end()
  })

  async function seed(entries: Record<string, unknown>[], type = "financial-entry") {
    const clinicId = crypto.randomUUID()
    clinicIds.push(clinicId)
    for (const payload of entries) {
      await pool.query("INSERT INTO api_resources (clinic_id, resource_type, payload) VALUES ($1, $2, $3::jsonb)", [clinicId, type, JSON.stringify(payload)])
    }
    return clinicId
  }

  const entry = (extra: Record<string, unknown>) => ({
    type: "income", description: "Sessão", category: "Consulta", competence: "2026-10", dueDate: "2026-10-20", amountCents: 10_000, payments: [], ...extra,
  })

  test("only the clinic's financial entries come back, with the row creation instant", async () => {
    const clinicId = await seed([entry({})])
    await pool.query("INSERT INTO api_resources (clinic_id, resource_type, payload) VALUES ($1, 'patient-note', '{}'::jsonb)", [clinicId])
    const rows = await repository.scan({ clinicId, filters: {}, limit: 10 })
    expect(rows).toHaveLength(1)
    expect(rows[0].payload).toMatchObject({ description: "Sessão" })
    expect(new Date(rows[0].createdAt).getTime()).not.toBeNaN()
    expect(await repository.scan({ clinicId: crypto.randomUUID(), filters: {}, limit: 10 })).toEqual([])
  })

  test("the coarse filters narrow by kind, due date, competence, amount and text", async () => {
    const clinicId = await seed([
      entry({ description: "Aluguel da sala", type: "expense", dueDate: "2026-10-05", amountCents: 50_000, category: "Aluguel" }),
      entry({ kind: "expense", description: "Material", dueDate: "2026-11-05", competence: "2026-11", amountCents: 2_000 }),
      entry({ description: "Sessão A", amountCents: 12_000 }),
      entry({ description: "Valor quebrado", amountCents: "abc" }),
    ])
    const scan = async (filters: object) => (await repository.scan({ clinicId, filters, limit: 50 })).map((r) => r.payload.description)
    expect(await scan({ kind: "expense" })).toEqual(["Aluguel da sala", "Material"]) // `kind` is the fallback of `type`
    expect(await scan({ from: "2026-10-10", to: "2026-10-31" })).toEqual(["Sessão A", "Valor quebrado"])
    expect(await scan({ competence: "2026-11" })).toEqual(["Material"])
    expect(await scan({ minCents: 10_000 })).toEqual(["Aluguel da sala", "Sessão A"])
    expect(await scan({ maxCents: 0 })).toEqual(["Valor quebrado"]) // a malformed amount reads as 0, as in the domain
    expect(await scan({ q: "alug" })).toEqual(["Aluguel da sala"])
    expect(await scan({ q: "100%" })).toEqual([]) // LIKE wildcards in the search are literal
  })

  test("the limit caps the rows", async () => {
    const clinicId = await seed([entry({}), entry({}), entry({})])
    expect(await repository.scan({ clinicId, filters: {}, limit: 2 })).toHaveLength(2)
  })

  test("recording an export writes one audit event with the count and no changes", async () => {
    const clinicId = await seed([])
    await repository.recordExport({ clinicId, actorId: "user-1", count: 3 })
    const { rows } = await pool.query("SELECT action, resource, resource_id, summary, changes FROM audit_events WHERE clinic_id = $1", [clinicId])
    expect(rows).toEqual([{ action: "export", resource: "financial-entry", resource_id: "export", summary: "Exportou 3 lançamentos", changes: null }])
  })
})
