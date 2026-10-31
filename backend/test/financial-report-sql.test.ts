import { describe, expect, test } from "bun:test"
import { drizzle } from "drizzle-orm/node-postgres"
import * as schema from "@/infrastructure/postgres/schema"
import {
  exportAuditQuery,
  scanEntriesQuery,
  type Executor,
} from "@/infrastructure/postgres/repositories/financial-report"

/** No connection: the query builders only render SQL. */
const executor = drizzle.mock({ schema }) as unknown as Executor
const clinicId = "11111111-1111-4111-8111-111111111111"

describe("financial report queries (SQL rendered by Drizzle)", () => {
  test("without filters the scan is bound to the clinic and the entry resource, ordered and capped", () => {
    const { sql, params } = scanEntriesQuery(executor, { clinicId, filters: {}, limit: 50_001 }).toSQL()
    expect(sql).toContain('from "api_resources"')
    expect(sql).toContain('"api_resources"."clinic_id" = $1')
    expect(sql).toContain('"api_resources"."resource_type" = $2')
    expect(sql).toContain('order by "api_resources"."created_at" asc, "api_resources"."id" asc')
    expect(sql).toContain("limit $3")
    expect(params).toEqual([clinicId, "financial-entry", 50_001])
  })

  test("every filter is a bound parameter and reads the payload the way the domain does", () => {
    const { sql, params } = scanEntriesQuery(executor, {
      clinicId,
      filters: { kind: "expense", from: "2026-10-01", to: "2026-10-31", competence: "2026-10", minCents: 100, maxCents: 9_900, q: "alu_guel" },
      limit: 10,
    }).toSQL()
    expect(sql).toContain("coalesce(\"api_resources\".\"payload\"->>'type', \"api_resources\".\"payload\"->>'kind')")
    expect(sql).toContain("jsonb_typeof(\"api_resources\".\"payload\"->'dueDate') = 'string'")
    expect(sql).toContain('collate "C" >= $4')
    expect(sql).toContain('collate "C" <= $5')
    expect(sql).toContain("jsonb_typeof(\"api_resources\".\"payload\"->'amountCents') = 'number'")
    expect(sql).toContain("ilike $9")
    expect(params).toEqual([clinicId, "financial-entry", "expense", "2026-10-01", "2026-10-31", "2026-10", 100, 9_900, "%alu\\_guel%", 10].filter((v) => v !== undefined))
    // Nothing the user typed is spliced into the SQL text, and no JSON key is a bound parameter (`jsonb -> $n` is ambiguous).
    for (const typed of ["2026-10-01", "2026-10-31", "alu_guel"]) expect(sql).not.toContain(typed)
    expect(sql).not.toMatch(/->>?\$\d/)
  })

  test("a text search with non-ASCII characters is left to the domain", () => {
    const { sql, params } = scanEntriesQuery(executor, { clinicId, filters: { q: "açaí" }, limit: 5 }).toSQL()
    expect(sql).not.toContain("ilike")
    expect(params).not.toContain("%açaí%")
  })

  test("the text search covers the derived code, description, category and counterparty", () => {
    const { sql } = scanEntriesQuery(executor, { clinicId, filters: { q: "lan" }, limit: 5 }).toSQL()
    expect(sql).toContain("'LAN-' || upper(left(\"api_resources\".\"id\"::text, 6))")
    for (const field of ["description", "category", "counterparty"]) expect(sql).toContain(`->'${field}'`)
    expect(sql).not.toMatch(/->>?\$\d/)
  })

  test("the export audit stores the fact and the count, with no changes, value or filter", () => {
    const { sql, params } = exportAuditQuery(executor, { clinicId, actorId: "user-1", count: 12 }).toSQL()
    expect(sql).toContain('insert into "audit_events"')
    expect(params).toEqual([clinicId, "user-1", "export", "financial-entry", "export", "Exportou 12 lançamentos", null, expect.anything(), expect.anything()].slice(0, params.length))
    expect(params).toContain("Exportou 12 lançamentos")
    expect(params).toContain(null)
    expect(exportAuditQuery(executor, { clinicId, actorId: "u", count: 1 }).toSQL().params).toContain("Exportou 1 lançamento")
  })
})
