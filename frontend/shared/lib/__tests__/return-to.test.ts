import { describe, expect, it } from "vitest"

import { afterLoginPath, loginUrl, safeReturnPath } from "../return-to"

describe("safeReturnPath", () => {
  it("aceita caminhos internos com query e hash", () => {
    expect(safeReturnPath("/pacientes/p1?editar=1")).toBe("/pacientes/p1?editar=1")
    expect(safeReturnPath("/configuracoes?aba=usuarios&novo=1#x")).toBe("/configuracoes?aba=usuarios&novo=1#x")
  })

  it("recusa destino externo, protocolo relativo, barra invertida e controle", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "pacientes", "/a\nb", "", null, undefined]) {
      expect(safeReturnPath(bad), String(bad)).toBeNull()
    }
  })

  it("não volta para o próprio login nem para a API", () => {
    expect(safeReturnPath("/entrar")).toBeNull()
    expect(safeReturnPath("/entrar?next=/pacientes")).toBeNull()
    expect(safeReturnPath("/api/v1/patients")).toBeNull()
  })
})

describe("loginUrl", () => {
  it("leva o endereço atual em next, codificado", () => {
    expect(loginUrl("/pacientes/p1?editar=1")).toBe("/entrar?next=%2Fpacientes%2Fp1%3Feditar%3D1")
  })

  it("sem destino útil, vai ao login limpo", () => {
    expect(loginUrl()).toBe("/entrar")
    expect(loginUrl("/painel")).toBe("/entrar")
    expect(loginUrl("/")).toBe("/entrar")
    expect(loginUrl("https://evil.test")).toBe("/entrar")
  })
})

describe("afterLoginPath", () => {
  it("volta ao next seguro depois de entrar; senão ao painel", () => {
    expect(afterLoginPath("?next=%2Fpacientes%2Fp1%3Feditar%3D1")).toBe("/pacientes/p1?editar=1")
    expect(afterLoginPath("")).toBe("/painel")
    expect(afterLoginPath("?next=https%3A%2F%2Fevil.test")).toBe("/painel")
    expect(afterLoginPath("?next=%2F%2Fevil.test")).toBe("/painel")
  })

  it("ida e volta com o login", () => {
    const url = loginUrl("/configuracoes?aba=usuarios&novo=1")
    expect(afterLoginPath(url.slice(url.indexOf("?")))).toBe("/configuracoes?aba=usuarios&novo=1")
  })
})
