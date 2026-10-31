import { describe, expect, test } from "bun:test"
import {
  applyFilters,
  buildReport,
  clinicToday,
  derive,
  entryOf,
  granularityOf,
  matchesFilters,
  parseReportFilters,
  parseSearchParams,
  searchEntries,
  toEntryView,
  type DerivedEntry,
  type QuerySource,
  type SourceRow,
} from "@/domain/financial-report"

const TODAY = "2026-10-31"

const source = (params: Record<string, string | string[]>): QuerySource => ({
  one: (name) => (Array.isArray(params[name]) ? params[name][0] : (params[name] as string | undefined)),
  many: (name) => (params[name] === undefined ? [] : Array.isArray(params[name]) ? params[name] : [params[name] as string]),
})

const row = (id: string, payload: Record<string, unknown> = {}): SourceRow => ({
  id,
  payload: {
    type: "income", description: "Sessão", category: "Consulta", competence: "2026-10", dueDate: "2026-10-20",
    amountCents: 10_000, payments: [], ...payload,
  },
  createdAt: "2026-10-01T12:00:00.000Z",
})
const pay = (amountCents: number, method = "pix", reversedAt: string | null = null) => ({ amountCents, method, paidAt: "2026-10-02", reversedAt })
const entry = (id: string, payload: Record<string, unknown> = {}): DerivedEntry => derive(entryOf(row(id, payload)), TODAY)

/** The scenario the indicator tests share (clinic today is 2026-10-31). */
const scenario = () => [
  entry("e1", { amountCents: 10_000, dueDate: "2026-10-05", payments: [pay(10_000, "pix")] }), // paid
  entry("e2", { amountCents: 20_000, dueDate: "2026-11-10", competence: "2026-11", payments: [pay(5_000, "card")] }), // partial, not due yet
  entry("e3", { amountCents: 8_000, dueDate: "2026-10-10" }), // overdue, nothing paid
  entry("e4", { amountCents: 6_000, dueDate: "2026-10-12", payments: [pay(1_000, "cash")] }), // overdue with a partial payment
  entry("e5", { amountCents: 3_000, cancelledAt: "2026-10-03T00:00:00.000Z" }), // cancelled
  entry("e6", { type: "expense", amountCents: 4_000, dueDate: "2026-10-15", category: "Aluguel", payments: [pay(4_000, "transfer")] }), // paid expense
  entry("e7", { type: "expense", amountCents: 2_000, dueDate: "2026-11-05", competence: "2026-11", category: "Material" }), // open expense
]

describe("entryOf / derive", () => {
  test("reads `type`, falls back to `kind`, and derives the code from the id", () => {
    expect(entryOf(row("3f2a1bcd-0000", { type: "expense" })).kind).toBe("expense")
    expect(entryOf({ id: "abcdef12", payload: { kind: "expense", amountCents: 5 }, createdAt: "x" }).kind).toBe("expense")
    expect(entryOf(row("3f2a1bcd-0000")).code).toBe("LAN-3F2A1B")
    expect(entryOf(row("x", { code: "LAN-0007" })).code).toBe("LAN-0007")
  })

  test("falls back to the row creation instant and tolerates malformed payloads", () => {
    expect(entryOf(row("a")).createdAt).toBe("2026-10-01T12:00:00.000Z")
    expect(entryOf(row("a", { createdAt: "2026-09-01T00:00:00.000Z" })).createdAt).toBe("2026-09-01T00:00:00.000Z")
    const broken = entryOf(row("a", { amountCents: "10", payments: [null, 3, { amountCents: 100, method: "bitcoin" }] }))
    expect(broken.amountCents).toBe(0)
    expect(broken.payments).toEqual([{ amountCents: 100, method: "other", reversedAt: null }])
  })

  test("situation follows RN-FIN-002, with the overdue balance kept for partial payments", () => {
    const [paid, partial, overdue, overduePartial, cancelled] = scenario()
    expect(paid).toMatchObject({ situation: "paid", paidCents: 10_000, balanceCents: 0 })
    expect(partial).toMatchObject({ situation: "partial", paidCents: 5_000, balanceCents: 15_000 })
    expect(overdue).toMatchObject({ situation: "overdue", balanceCents: 8_000 })
    expect(overduePartial).toMatchObject({ situation: "overdue", paidCents: 1_000, balanceCents: 5_000 })
    expect(cancelled.situation).toBe("cancelled")
  })

  test("a reversed payment no longer counts", () => {
    const reversed = entry("r", { dueDate: "2026-12-01", payments: [pay(10_000, "pix", "2026-10-03T00:00:00.000Z")] })
    expect(reversed).toMatchObject({ situation: "open", paidCents: 0, balanceCents: 10_000 })
  })
})

describe("clinicToday", () => {
  test("is the civil date in America/Sao_Paulo", () => {
    expect(clinicToday(new Date("2026-11-01T01:30:00Z"))).toBe("2026-10-31")
    expect(clinicToday(new Date("2026-10-31T12:00:00Z"))).toBe("2026-10-31")
    expect(clinicToday(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11-01")
  })
})

describe("parseReportFilters", () => {
  test("reads every filter, accepting repeated and comma separated lists", () => {
    const parsed = parseReportFilters(
      source({
        from: "2026-10-01", to: "2026-10-31", kind: "income", status: ["open,paid", "overdue"], competence: "2026-10",
        q: "  pix  ", method: "pix,card", category: ["Aluguel, condomínio", "Material"], minCents: "100", maxCents: "9900",
      }),
    )
    expect(parsed).toEqual({
      ok: true,
      value: {
        from: "2026-10-01", to: "2026-10-31", kind: "income", situations: ["open", "paid", "overdue"], competence: "2026-10",
        q: "pix", methods: ["pix", "card"], categories: ["Aluguel, condomínio", "Material"], minCents: 100, maxCents: 9900,
      },
    })
  })

  test("`all` means no filter and no parameters mean an empty filter", () => {
    expect(parseReportFilters(source({ kind: "all", status: "all" }))).toEqual({ ok: true, value: {} })
    expect(parseReportFilters(source({}))).toEqual({ ok: true, value: {} })
  })

  test.each([
    [{ from: "2026-13-01" }, "Data inicial inválida"],
    [{ to: "31/10/2026" }, "Data final inválida"],
    [{ from: "2026-10-31", to: "2026-10-01" }, "posterior"],
    [{ kind: "other" }, "Tipo"],
    [{ status: "late" }, "Situação inválida"],
    [{ competence: "2026-13" }, "Competência"],
    [{ q: "x".repeat(101) }, "100"],
    [{ method: "bitcoin" }, "Forma de pagamento"],
    [{ minCents: "-1" }, "centavos"],
    [{ minCents: "12.5" }, "centavos"],
    [{ minCents: "500", maxCents: "100" }, "mínimo"],
  ])("rejects %j with a pt-BR message", (params, fragment) => {
    const parsed = parseReportFilters(source(params))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.detail).toContain(fragment)
  })
})

describe("parseSearchParams", () => {
  test("defaults to the first page of 20 by due date", () => {
    expect(parseSearchParams(source({}))).toEqual({ ok: true, value: { page: 1, pageSize: 20, sort: "dueDate", dir: "asc" } })
  })

  test.each<Record<string, string>>([{ page: "0" }, { page: "x" }, { pageSize: "0" }, { pageSize: "201" }, { sort: "amountCents" }, { dir: "up" }])(
    "rejects %j",
    (params) => expect(parseSearchParams(source(params)).ok).toBe(false),
  )
})

describe("matchesFilters", () => {
  const all = scenario()
  const ids = (filters: Parameters<typeof applyFilters>[1]) => applyFilters(all, filters).map((e) => e.id)

  test("kind, due date range, competence and amount range", () => {
    expect(ids({ kind: "expense" })).toEqual(["e6", "e7"])
    expect(ids({ from: "2026-10-10", to: "2026-10-12" })).toEqual(["e3", "e4"])
    expect(ids({ competence: "2026-11" })).toEqual(["e2", "e7"])
    expect(ids({ minCents: 8_000, maxCents: 10_000 })).toEqual(["e1", "e3"])
  })

  test("situation is the derived one, not the stored status", () => {
    expect(ids({ situations: ["overdue"] })).toEqual(["e3", "e4"])
    expect(ids({ situations: ["paid", "cancelled"] })).toEqual(["e1", "e5", "e6"])
  })

  test("method matches only active payments, category is exact, text finds code, description, category and counterparty", () => {
    const reversed = entry("rv", { payments: [pay(1_000, "boleto", "2026-10-03T00:00:00.000Z")] })
    expect(matchesFilters(reversed, { methods: ["boleto"] })).toBe(false)
    expect(ids({ methods: ["pix", "cash"] })).toEqual(["e1", "e4"])
    expect(ids({ categories: ["Aluguel"] })).toEqual(["e6"])
    expect(ids({ q: "ALUGUEL" })).toEqual(["e6"])
    expect(ids({ q: "lan-e1" })).toEqual(["e1"])
    expect(matchesFilters(entry("c", { counterparty: "Clínica Sul" }), { q: "sul" })).toBe(true)
  })
})

describe("buildReport · indicators", () => {
  const { indicators } = buildReport(scenario(), {})

  test("received, receivable, overdue, expenses and result", () => {
    expect(indicators.receivedCents).toBe(16_000) // 10.000 + 5.000 + 1.000 (the partial payment of the overdue entry counts)
    expect(indicators.receivableCents).toBe(15_000) // only the partial entry that is not due yet
    expect(indicators.overdueCents).toBe(13_000) // 8.000 + the 5.000 left on the overdue partial
    expect(indicators.expensesCents).toBe(4_000)
    expect(indicators.resultCents).toBe(12_000)
    expect(indicators.entryCount).toBe(7)
  })

  test("average ticket divides the received amount by the income entries that have a payment", () => {
    expect(indicators.averageTicketCents).toBe(5_333) // 16.000 / 3 paid or partially paid income entries
    expect(buildReport([entry("x", { dueDate: "2026-12-01" })], {}).indicators.averageTicketCents).toBe(0)
  })

  test("the cancelled entry never counts, and the filters narrow what is summed", () => {
    expect(buildReport(scenario(), { kind: "income", situations: ["overdue"] }).indicators).toMatchObject({
      receivedCents: 1_000, overdueCents: 13_000, receivableCents: 0, expensesCents: 0, averageTicketCents: 1_000, entryCount: 2,
    })
    expect(buildReport([entry("c", { cancelledAt: "2026-10-03T00:00:00.000Z" })], {}).indicators).toMatchObject({
      receivedCents: 0, receivableCents: 0, overdueCents: 0, entryCount: 1,
    })
  })

  test("an empty set is all zeros", () => {
    expect(buildReport([], {}).indicators).toEqual({
      receivedCents: 0, receivableCents: 0, overdueCents: 0, expensesCents: 0, resultCents: 0, averageTicketCents: 0, entryCount: 0,
    })
  })
})

describe("buildReport · distributions and facets", () => {
  const report = buildReport(scenario(), {})

  test("by situation lists every situation in a fixed order with count and amount", () => {
    expect(report.bySituation).toEqual([
      { situation: "open", count: 1, amountCents: 2_000 },
      { situation: "partial", count: 1, amountCents: 20_000 },
      { situation: "paid", count: 2, amountCents: 14_000 },
      { situation: "overdue", count: 2, amountCents: 14_000 },
      { situation: "cancelled", count: 1, amountCents: 3_000 },
    ])
  })

  test("by method sums the active payments, split by income and expense, largest first", () => {
    expect(report.byMethod).toEqual([
      { method: "pix", count: 1, incomeCents: 10_000, expenseCents: 0 },
      { method: "card", count: 1, incomeCents: 5_000, expenseCents: 0 },
      { method: "transfer", count: 1, incomeCents: 0, expenseCents: 4_000 },
      { method: "cash", count: 1, incomeCents: 1_000, expenseCents: 0 },
    ])
  })

  test("facets ignore the filter they feed", () => {
    const filtered = buildReport(scenario(), { categories: ["Material"], competence: "2026-10" })
    expect(filtered.facets.categories).toEqual(["Aluguel", "Consulta"]) // the competence applies, the category does not
    expect(filtered.facets.competences).toEqual(["2026-11"]) // the category applies, the competence does not
    expect(buildReport(scenario(), { competence: "2026-10" }).facets.competences).toEqual(["2026-11", "2026-10"])
  })
})

describe("buildReport · series", () => {
  test("monthly by due date without a range, cancelled entries ignored, settled amounts alongside", () => {
    expect(buildReport(scenario(), {}).series).toEqual({
      granularity: "month",
      points: [
        { period: "2026-10", incomeCents: 24_000, expenseCents: 4_000, incomeSettledCents: 11_000, expenseSettledCents: 4_000 },
        { period: "2026-11", incomeCents: 20_000, expenseCents: 2_000, incomeSettledCents: 5_000, expenseSettledCents: 0 },
      ],
    })
  })

  test("daily and gap-filled when the range spans at most 31 days", () => {
    const { series } = buildReport(scenario(), { from: "2026-10-09", to: "2026-10-13" })
    expect(series.granularity).toBe("day")
    expect(series.points.map((p) => p.period)).toEqual(["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"])
    expect(series.points.map((p) => p.incomeCents)).toEqual([0, 8_000, 0, 6_000, 0])
    expect(granularityOf({ from: "2026-10-01", to: "2026-10-31" })).toBe("day") // 31 days inclusive
    expect(granularityOf({ from: "2026-10-01", to: "2026-11-01" })).toBe("month")
  })

  test("monthly ranges are filled month by month across a year boundary", () => {
    const { series } = buildReport([entry("a", { dueDate: "2026-12-10" })], { from: "2026-11-15", to: "2027-02-10" })
    expect(series.points.map((p) => p.period)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"])
    expect(series.points[1].incomeCents).toBe(10_000)
  })
})

describe("searchEntries", () => {
  const all = scenario()

  test("paginates the filtered set and reports the total", () => {
    const result = searchEntries(all, { kind: "income" }, { page: 2, pageSize: 2, sort: "dueDate", dir: "asc" })
    expect(result.total).toBe(5)
    expect(result.items.map((e) => e.id)).toEqual(["e4", "e5"]) // income by due date: e1, e3, | e4, e5, | e2
    expect(searchEntries(all, {}, { page: 1, pageSize: 3, sort: "dueDate", dir: "asc" }).items.map((e) => e.id)).toEqual(["e1", "e3", "e4"])
    expect(searchEntries(all, {}, { page: 9, pageSize: 3, sort: "dueDate", dir: "asc" })).toMatchObject({ items: [], total: 7, page: 9 })
  })

  test("sorts by the chosen column in both directions with a stable tie-break", () => {
    const byAmount = (dir: "asc" | "desc") => searchEntries(all, {}, { page: 1, pageSize: 50, sort: "amount", dir }).items.map((e) => e.id)
    expect(byAmount("desc")).toEqual(["e2", "e1", "e3", "e4", "e6", "e5", "e7"])
    expect(byAmount("asc")).toEqual(["e7", "e5", "e6", "e4", "e3", "e1", "e2"])
    const twins = [entry("b", { amountCents: 500 }), entry("a", { amountCents: 500 })]
    expect(searchEntries(twins, {}, { page: 1, pageSize: 10, sort: "amount", dir: "asc" }).items.map((e) => e.id)).toEqual(["a", "b"])
  })

  test("sorts by situation rank and by balance", () => {
    const sit = searchEntries(all, {}, { page: 1, pageSize: 50, sort: "situation", dir: "asc" }).items.map((e) => e.situation)
    expect(sit).toEqual(["open", "partial", "overdue", "overdue", "paid", "paid", "cancelled"])
    expect(searchEntries(all, {}, { page: 1, pageSize: 1, sort: "balance", dir: "desc" }).items[0].id).toBe("e2")
  })

  test("the view carries the derived situation and balance and never the payments", () => {
    const view = toEntryView(all[3])
    expect(view).toMatchObject({ id: "e4", code: "LAN-E4", kind: "income", situation: "overdue", paidCents: 1_000, balanceCents: 5_000 })
    expect("payments" in view).toBe(false)
  })

  test("the view lists each active payment method once, in registration order", () => {
    const mixed = entry("m", {
      dueDate: "2026-12-01",
      payments: [pay(100, "pix"), pay(200, "card", "2026-10-03T00:00:00.000Z"), pay(300, "cash"), pay(400, "pix")],
    })
    expect(toEntryView(mixed).methods).toEqual(["pix", "cash"])
    expect(toEntryView(entry("n")).methods).toEqual([])
  })
})
