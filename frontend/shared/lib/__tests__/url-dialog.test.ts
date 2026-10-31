import { describe, expect, it } from "vitest"

import { buildUrlDialog, buildUrlParam, parseUrlDialog, URL_DIALOG_FLAG } from "../url-dialog"

const at = (pathname: string, search = "", hash = "") => ({ pathname, search, hash })

describe("parseUrlDialog", () => {
  it("lê ?novo=1 e ?editar=<id|1>", () => {
    expect(parseUrlDialog("?novo=1", "novo")).toEqual({ isOpen: true, value: "1" })
    expect(parseUrlDialog("?editar=1", "editar")).toEqual({ isOpen: true, value: "1" })
    expect(parseUrlDialog("?editar=3f2c1a9e-77aa-4b1d-9c3e-0123456789ab", "editar")).toEqual({
      isOpen: true,
      value: "3f2c1a9e-77aa-4b1d-9c3e-0123456789ab",
    })
  })

  it("fechado quando o parâmetro não existe, está vazio ou fora do padrão", () => {
    const closed = { isOpen: false, value: null }
    expect(parseUrlDialog("", "novo")).toEqual(closed)
    expect(parseUrlDialog("?aba=usuarios", "editar")).toEqual(closed)
    expect(parseUrlDialog("?editar=", "editar")).toEqual(closed)
    expect(parseUrlDialog("?editar=<script>", "editar")).toEqual(closed)
    expect(parseUrlDialog("?editar=a/b", "editar")).toEqual(closed)
    expect(parseUrlDialog(`?editar=${"x".repeat(101)}`, "editar")).toEqual(closed)
  })

  it("aceita URLSearchParams e ignora os outros parâmetros", () => {
    expect(parseUrlDialog(new URLSearchParams("aba=papeis&novo=1&q=ana"), "novo")).toEqual({ isOpen: true, value: "1" })
  })
})

describe("buildUrlDialog", () => {
  it("abre preservando caminho, demais parâmetros e hash", () => {
    expect(buildUrlDialog(at("/configuracoes", "?aba=usuarios", "#topo"), "novo", URL_DIALOG_FLAG)).toBe(
      "/configuracoes?aba=usuarios&novo=1#topo"
    )
    expect(buildUrlDialog(at("/pacientes/p1"), "editar", "1")).toBe("/pacientes/p1?editar=1")
  })

  it("fecha só o próprio parâmetro e deixa a URL limpa quando não sobra query", () => {
    expect(buildUrlDialog(at("/pacientes", "?novo=1"), "novo", null)).toBe("/pacientes")
    expect(buildUrlDialog(at("/pacientes", "?status=active&novo=1", "#x"), "novo", null)).toBe("/pacientes?status=active#x")
    expect(buildUrlDialog(at("/pacientes", "?status=active"), "editar", null)).toBe("/pacientes?status=active")
  })

  it("novo e editar são mutuamente exclusivos: abrir um fecha o outro", () => {
    expect(buildUrlDialog(at("/servicos", "?editar=s1"), "novo", "1")).toBe("/servicos?novo=1")
    expect(buildUrlDialog(at("/servicos", "?novo=1"), "editar", "s2")).toBe("/servicos?editar=s2")
    expect(buildUrlDialog(at("/servicos", "?novo=1&editar=s1"), "editar", "s3")).toBe("/servicos?editar=s3")
  })

  it("trocar o registro editado mantém um único ?editar=", () => {
    expect(buildUrlDialog(at("/servicos", "?editar=s1"), "editar", "s2")).toBe("/servicos?editar=s2")
  })

  it("recusa valor que não seja id seguro", () => {
    expect(() => buildUrlDialog(at("/x"), "editar", "a b")).toThrow()
    expect(() => buildUrlDialog(at("/x"), "editar", "")).toThrow()
  })

  it("ida e volta: o que abre é lido de volta", () => {
    const url = buildUrlDialog(at("/aba", "?filtro=ativos"), "editar", "plano-7")
    const search = url.slice(url.indexOf("?"))
    expect(parseUrlDialog(search, "editar")).toEqual({ isOpen: true, value: "plano-7" })
    expect(new URLSearchParams(search).get("filtro")).toBe("ativos")
  })
})

describe("buildUrlParam", () => {
  it("define e remove um parâmetro de estado (aba) sem mexer no resto", () => {
    expect(buildUrlParam(at("/configuracoes", "?novo=1"), "aba", "usuarios")).toBe("/configuracoes?novo=1&aba=usuarios")
    expect(buildUrlParam(at("/configuracoes", "?aba=papeis&x=1", "#a"), "aba", "usuarios")).toBe("/configuracoes?aba=usuarios&x=1#a")
    expect(buildUrlParam(at("/configuracoes", "?aba=papeis"), "aba", null)).toBe("/configuracoes")
  })
})
