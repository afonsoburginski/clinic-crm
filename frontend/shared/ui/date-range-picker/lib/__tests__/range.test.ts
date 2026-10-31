import { describe, expect, it } from "vitest"

import {
  addDaysYmd,
  dateToYmd,
  endOfMonthYmd,
  formatRangeLabel,
  fromPickerRange,
  isEmptyRange,
  isYmd,
  matchPreset,
  normalizeRange,
  presetRange,
  rangeContains,
  sameRange,
  todayKey,
  toDateKey,
  toPickerRange,
  ymdToDate,
  PRESET_IDS,
} from "../range"

describe("datas civis", () => {
  it("isYmd recusa formato e datas inexistentes", () => {
    expect(isYmd("2026-02-28")).toBe(true)
    expect(isYmd("2024-02-29")).toBe(true)
    for (const bad of ["2026-02-30", "2026-13-01", "26-01-01", "2026-1-1", "", undefined, null, 20260101]) expect(isYmd(bad)).toBe(false)
  })

  it("aritmética atravessa mês, ano e bissexto sem escorregar um dia", () => {
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDaysYmd("2024-03-01", -1)).toBe("2024-02-29")
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01")
    expect(endOfMonthYmd("2026-02-10")).toBe("2026-02-28")
    expect(endOfMonthYmd("2026-04-01")).toBe("2026-04-30")
  })

  it("todayKey usa o fuso da clínica, não o UTC", () => {
    // 01:30 UTC de 2026-03-10 ainda é 22:30 do dia 9 em São Paulo.
    expect(todayKey(new Date("2026-03-10T01:30:00Z"))).toBe("2026-03-09")
    expect(todayKey(new Date("2026-03-10T15:00:00Z"))).toBe("2026-03-10")
  })
})

describe("presets", () => {
  const today = "2026-03-18"
  it("cada preset devolve o intervalo esperado", () => {
    expect(presetRange("today", today)).toEqual({ from: "2026-03-18", to: "2026-03-18" })
    expect(presetRange("last7", today)).toEqual({ from: "2026-03-12", to: "2026-03-18" })
    expect(presetRange("last30", today)).toEqual({ from: "2026-02-17", to: "2026-03-18" })
    expect(presetRange("thisMonth", today)).toEqual({ from: "2026-03-01", to: "2026-03-31" })
    expect(presetRange("lastMonth", today)).toEqual({ from: "2026-02-01", to: "2026-02-28" })
    expect(presetRange("thisYear", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" })
  })

  it("mês passado em janeiro volta para dezembro do ano anterior", () => {
    expect(presetRange("lastMonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" })
  })

  it("matchPreset reconhece o valor atual e ignora intervalos livres", () => {
    for (const id of PRESET_IDS) expect(matchPreset(presetRange(id, today), today)).toBe(id)
    expect(matchPreset({ from: "2026-03-01", to: "2026-03-30" }, today)).toBeUndefined()
    expect(matchPreset({}, today)).toBeUndefined()
  })
})

describe("normalização e comparação", () => {
  it("troca pontas invertidas e descarta datas inválidas", () => {
    expect(normalizeRange({ from: "2026-03-20", to: "2026-03-10" })).toEqual({ from: "2026-03-10", to: "2026-03-20" })
    expect(normalizeRange({ from: "2026-02-30", to: "2026-03-10" })).toEqual({ to: "2026-03-10" })
    expect(normalizeRange(undefined)).toEqual({})
    expect(isEmptyRange({ from: "x" })).toBe(true)
    expect(isEmptyRange({ to: "2026-03-10" })).toBe(false)
  })

  it("sameRange compara depois de normalizar", () => {
    expect(sameRange({ from: "2026-03-20", to: "2026-03-10" }, { from: "2026-03-10", to: "2026-03-20" })).toBe(true)
    expect(sameRange({ from: "2026-03-10" }, { from: "2026-03-10", to: "2026-03-10" })).toBe(false)
  })

  it("formatRangeLabel descreve ponta aberta, dia único e vazio", () => {
    expect(formatRangeLabel({ from: "2026-03-01", to: "2026-03-31" })).toBe("01/03/2026 – 31/03/2026")
    expect(formatRangeLabel({ from: "2026-03-05", to: "2026-03-05" })).toBe("05/03/2026")
    expect(formatRangeLabel({ from: "2026-03-05" })).toBe("A partir de 05/03/2026")
    expect(formatRangeLabel({ to: "2026-03-05" })).toBe("Até 05/03/2026")
    expect(formatRangeLabel({})).toBe("Período")
    expect(formatRangeLabel(undefined, "Vencimento")).toBe("Vencimento")
  })
})

describe("filtro de linha por período", () => {
  it("toDateKey aceita data civil e converte instante no fuso da clínica", () => {
    expect(toDateKey("2026-03-10")).toBe("2026-03-10")
    expect(toDateKey("2026-03-10T01:30:00Z")).toBe("2026-03-09")
    expect(toDateKey("não é data")).toBeNull()
    expect(toDateKey(null)).toBeNull()
  })

  it("rangeContains inclui as duas pontas e aceita ponta aberta", () => {
    const range = { from: "2026-03-10", to: "2026-03-20" }
    expect(rangeContains(range, "2026-03-10")).toBe(true)
    expect(rangeContains(range, "2026-03-20")).toBe(true)
    expect(rangeContains(range, "2026-03-21")).toBe(false)
    expect(rangeContains({ from: "2026-03-10" }, "2030-01-01")).toBe(true)
    expect(rangeContains({ to: "2026-03-10" }, "2026-03-11")).toBe(false)
    expect(rangeContains({}, "qualquer")).toBe(true)
    expect(rangeContains(range, null)).toBe(false)
  })
})

describe("ponte com o react-day-picker", () => {
  it("ida e volta preserva o dia civil", () => {
    expect(dateToYmd(ymdToDate("2026-03-05"))).toBe("2026-03-05")
    const picker = toPickerRange({ from: "2026-03-05", to: "2026-03-09" })
    expect(picker && [dateToYmd(picker.from!), dateToYmd(picker.to!)]).toEqual(["2026-03-05", "2026-03-09"])
    expect(fromPickerRange(picker)).toEqual({ from: "2026-03-05", to: "2026-03-09" })
  })

  it("intervalo vazio vira undefined e seleção parcial mantém só o início", () => {
    expect(toPickerRange({})).toBeUndefined()
    expect(fromPickerRange(undefined)).toEqual({})
    expect(fromPickerRange({ from: ymdToDate("2026-03-05") })).toEqual({ from: "2026-03-05" })
  })
})
