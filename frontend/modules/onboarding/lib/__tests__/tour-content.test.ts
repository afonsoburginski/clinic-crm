import { describe, expect, it } from "vitest"

import type { Role, User } from "@/domain/types"

import { featuresFor, TOUR_FEATURES, tipsFor } from "../tour-content"

const ROLES: Role[] = ["admin", "reception", "professional", "finance", "manager"]

const user = (roles: Role[]): User => ({ id: `u-${roles.join("-")}`, name: "Perfil de teste", email: "teste@example.test", title: "Teste", roles })

describe("roteiro da orientação", () => {
  it("só lista áreas que o perfil consegue abrir", () => {
    const reception = featuresFor(user(["reception"])).map((f) => f.id)
    expect(reception).toContain("agenda")
    expect(reception).toContain("patients")
    expect(reception).not.toContain("clinical")
    expect(reception).not.toContain("admin")

    const admin = featuresFor(user(["admin"])).map((f) => f.id)
    expect(admin).toContain("admin")
  })

  it("não lista nada sem usuário", () => {
    expect(featuresFor(null)).toEqual([])
  })

  it("todo perfil tem ao menos uma área para começar", () => {
    for (const role of ROLES) {
      expect(featuresFor(user([role])).length).toBeGreaterThan(0)
    }
  })

  it("itens têm destino interno e passos", () => {
    for (const feature of TOUR_FEATURES) {
      expect(feature.href.startsWith("/")).toBe(true)
      expect(feature.steps.length).toBeGreaterThan(0)
    }
    expect(new Set(TOUR_FEATURES.map((f) => f.id)).size).toBe(TOUR_FEATURES.length)
  })

  it("a dica de busca depende da permissão e a dica da conta sempre aparece", () => {
    expect(tipsFor(user(["reception"])).some((t) => t.id === "quick-search")).toBe(true)
    expect(tipsFor(user(["manager"])).some((t) => t.id === "quick-search")).toBe(false)
    expect(tipsFor(null).at(-1)?.id).toBe("account")
  })
})
