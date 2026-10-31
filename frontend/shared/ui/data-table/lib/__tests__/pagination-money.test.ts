import { describe, expect, it } from "vitest"

import { formatMoneyInput, parseMoneyToCents } from "../money"
import { clampPage, pageCountOf, pageWindow, paginate, parsePageInput } from "../pagination"

describe("paginação em memória", () => {
  it("pageCountOf nunca é menor que 1", () => {
    expect(pageCountOf(0, 20)).toBe(1)
    expect(pageCountOf(20, 20)).toBe(1)
    expect(pageCountOf(21, 20)).toBe(2)
    expect(pageCountOf(101, 50)).toBe(3)
  })

  it("clampPage mantém a página no intervalo e trata lixo", () => {
    expect(clampPage(5, 3)).toBe(2)
    expect(clampPage(-1, 3)).toBe(0)
    expect(clampPage(Number.NaN, 3)).toBe(0)
    expect(clampPage(1.9, 3)).toBe(1)
  })

  it("pageWindow dá a faixa 1-based de 'Mostrando X–Y de Z'", () => {
    expect(pageWindow(0, 20, 53)).toEqual({ from: 1, to: 20 })
    expect(pageWindow(2, 20, 53)).toEqual({ from: 41, to: 53 })
    expect(pageWindow(0, 20, 0)).toEqual({ from: 0, to: 0 })
  })

  it("paginate fatia a página pedida", () => {
    const rows = Array.from({ length: 25 }, (_, i) => i)
    expect(paginate(rows, 1, 10)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    expect(paginate(rows, 2, 10)).toEqual([20, 21, 22, 23, 24])
    expect(paginate(rows, 9, 10)).toEqual([])
  })

  it("parsePageInput converte 'ir para a página' em índice válido", () => {
    expect(parsePageInput("3", 5)).toBe(2)
    expect(parsePageInput(" 9 ", 5)).toBe(4)
    for (const bad of ["", "0", "-2", "1.5", "abc"]) expect(parsePageInput(bad, 5)).toBeNull()
  })
})

describe("moeda pt-BR", () => {
  it("parseMoneyToCents aceita milhar com ponto e decimal com vírgula", () => {
    expect(parseMoneyToCents("1.234,56")).toBe(123_456)
    expect(parseMoneyToCents("1234,5")).toBe(123_450)
    expect(parseMoneyToCents("R$ 12")).toBe(1200)
    expect(parseMoneyToCents("0,01")).toBe(1)
    expect(parseMoneyToCents("")).toBeUndefined()
  })

  it("recusa mais de 2 casas, negativo e texto (nunca arredonda)", () => {
    for (const bad of ["10,005", "-5", "abc", "1,2,3", "12.34", "1.23,4"]) expect(parseMoneyToCents(bad)).toBeNull()
  })

  it("formatMoneyInput devolve o texto editável", () => {
    expect(formatMoneyInput(123_456)).toBe("1.234,56")
    expect(formatMoneyInput(5)).toBe("0,05")
    expect(formatMoneyInput(undefined)).toBe("")
  })
})
