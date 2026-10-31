import { describe, expect, it } from "vitest"

import { compareValues } from "../sort"

const sorted = (values: unknown[]) => [...values].sort(compareValues)

describe("compareValues", () => {
  it("ordena texto em pt-BR sem jogar acentuados para o fim", () => {
    expect(sorted(["Zélia", "Álvaro", "bruno", "Ana", "Éder"])).toEqual(["Álvaro", "Ana", "bruno", "Éder", "Zélia"])
  })

  it("trata números dentro do texto como número", () => {
    expect(sorted(["Sala 10", "Sala 2", "Sala 1"])).toEqual(["Sala 1", "Sala 2", "Sala 10"])
  })

  it("ordena números, booleanos, datas e datas ISO", () => {
    expect(sorted([10, 2, 33, -1])).toEqual([-1, 2, 10, 33])
    expect(sorted([true, false])).toEqual([false, true])
    expect(sorted([new Date("2026-03-02"), new Date("2026-03-01")])).toEqual([new Date("2026-03-01"), new Date("2026-03-02")])
    expect(sorted(["2026-03-10", "2026-03-09", "2025-12-31"])).toEqual(["2025-12-31", "2026-03-09", "2026-03-10"])
  })

  it("vazio fica por último em ordem crescente", () => {
    expect(sorted(["b", "", null, "a", Number.NaN])).toEqual(["a", "b", "", null, Number.NaN])
    expect(compareValues(null, undefined)).toBe(0)
    expect(compareValues(undefined, "a")).toBeGreaterThan(0)
    expect(compareValues("a", undefined)).toBeLessThan(0)
  })
})
