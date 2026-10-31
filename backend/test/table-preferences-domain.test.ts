import { describe, expect, test } from "bun:test"
import {
  MAX_VIEW_BYTES,
  parseTableKey,
  parseViewInput,
  parseViewName,
} from "@/domain/table-preferences"

const ok = (parsed: { ok: boolean }) => parsed.ok

describe("table keys and view names", () => {
  test("a table key is lowercase letters, digits and hyphens up to 60 characters", () => {
    for (const key of ["patients", "financial-entries", "a", "x".repeat(60)]) expect(ok(parseTableKey(key))).toBe(true)
    for (const key of ["", "Patients", "a_b", "a b", "x".repeat(61), "../etc", undefined, 3]) {
      expect(ok(parseTableKey(key))).toBe(false)
    }
  })

  test("a view name is trimmed, 1 to 40 characters, with no control characters", () => {
    expect(parseViewName("  Pendentes  ")).toEqual({ ok: true, value: "Pendentes" })
    for (const name of ["", "   ", "x".repeat(41), "a\nb", "a\u0000b", undefined]) expect(ok(parseViewName(name))).toBe(false)
  })
})

describe("view input", () => {
  test("an empty body is a valid view with no preferences", () => {
    expect(parseViewInput({}, "default")).toEqual({
      ok: true,
      value: { pageSize: null, sort: [], hiddenColumns: [], columnOrder: [], filters: {}, isDefault: false },
    })
  })

  test("keeps what the table can restore and drops repeated columns and sort rules", () => {
    const parsed = parseViewInput(
      {
        pageSize: 50,
        sort: [{ id: "dueDate", desc: true }, { id: "dueDate", desc: false }],
        hiddenColumns: ["code", "code", "category"],
        columnOrder: ["status", "description"],
        filters: { _search: "ana", status: ["open", "overdue"], amount: { min: 1000, max: null }, onlyMine: true },
        isDefault: true,
      },
      "Pendentes",
    )
    expect(parsed).toEqual({
      ok: true,
      value: {
        pageSize: 50,
        sort: [{ id: "dueDate", desc: true }],
        hiddenColumns: ["code", "category"],
        columnOrder: ["status", "description"],
        filters: { _search: "ana", status: ["open", "overdue"], amount: { min: 1000, max: null }, onlyMine: true },
        isDefault: true,
      },
    })
  })

  test("refuses what could not be restored instead of storing it", () => {
    const bad: unknown[] = [
      null, [], "x",
      { pageSize: 0 }, { pageSize: 201 }, { pageSize: 10.5 }, { pageSize: "10" },
      { sort: "name" }, { sort: Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, desc: false })) }, { sort: [{ id: "a b", desc: false }] },
      { sort: [{ id: "a", desc: "yes" }] },
      { hiddenColumns: "a" }, { hiddenColumns: [1] }, { hiddenColumns: ["bad key"] }, { columnOrder: Array.from({ length: 61 }, (_, i) => `c${i}`) },
      { filters: [] }, { filters: { a: { b: { c: 1 } } } }, { filters: { a: [[1]] } }, { filters: { "bad key": 1 } },
      { filters: { a: "x".repeat(201) } }, { filters: { a: Number.NaN } }, { filters: { a: () => 1 } },
      { isDefault: "yes" },
    ]
    for (const body of bad) expect([body, parseViewInput(body, "v").ok]).toEqual([body, false])
  })

  test("the default preferences view cannot be the initial view", () => {
    expect(ok(parseViewInput({ isDefault: true }, "default"))).toBe(false)
    expect(ok(parseViewInput({ isDefault: true }, "Pendentes"))).toBe(true)
  })

  test("a view above the size limit is refused", () => {
    const filters = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, Array.from({ length: 100 }, () => "x".repeat(10))]))
    expect(JSON.stringify(filters).length).toBeGreaterThan(MAX_VIEW_BYTES)
    expect(ok(parseViewInput({ filters }, "v"))).toBe(false)
  })
})
