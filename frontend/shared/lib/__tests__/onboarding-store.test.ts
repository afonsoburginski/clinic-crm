import { describe, expect, it } from "vitest"
import type { StateStorage } from "zustand/middleware"

import { createOnboardingStore, shouldAutoOpenTour, TOUR_VERSION } from "../onboarding-store"

function memory(initial: Record<string, string> = {}): StateStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (name) => data[name] ?? null,
    setItem: (name, value) => void (data[name] = value),
    removeItem: (name) => void delete data[name],
  }
}

describe("onboarding store", () => {
  it("abre automaticamente só na primeira visita do perfil", () => {
    const store = createOnboardingStore(memory())
    expect(shouldAutoOpenTour(store.getState().records["u1"])).toBe(true)

    store.getState().finish("u1", "dismissed")

    expect(shouldAutoOpenTour(store.getState().records["u1"])).toBe(false)
    expect(shouldAutoOpenTour(store.getState().records["u2"])).toBe(true)
  })

  it("persiste o desfecho e o recupera numa nova sessão", async () => {
    const storage = memory()
    createOnboardingStore(storage).getState().finish("u1", "completed")
    expect(JSON.parse(storage.data["clinica-demo-onboarding"]).state.records.u1).toMatchObject({ outcome: "completed", version: TOUR_VERSION })

    const next = createOnboardingStore(storage)
    await next.persist.rehydrate()

    expect(next.getState().records["u1"]?.outcome).toBe("completed")
    expect(shouldAutoOpenTour(next.getState().records["u1"])).toBe(false)
  })

  it("dispensar uma revisão não desfaz a conclusão", () => {
    const store = createOnboardingStore(memory())
    store.getState().finish("u1", "completed")
    store.getState().finish("u1", "dismissed")

    expect(store.getState().records["u1"]?.outcome).toBe("completed")
  })

  it("concluir depois de dispensar atualiza o desfecho", () => {
    const store = createOnboardingStore(memory())
    store.getState().finish("u1", "dismissed")
    store.getState().finish("u1", "completed")

    expect(store.getState().records["u1"]?.outcome).toBe("completed")
  })

  it("roteiro de versão antiga volta a abrir uma vez", () => {
    expect(shouldAutoOpenTour({ outcome: "completed", version: TOUR_VERSION - 1, at: "2026-01-01T00:00:00.000Z" })).toBe(true)
  })

  it("reset libera a orientação de um perfil sem tocar nos outros", () => {
    const store = createOnboardingStore(memory())
    store.getState().finish("u1", "completed")
    store.getState().finish("u2", "dismissed")

    store.getState().reset("u1")

    expect(store.getState().records["u1"]).toBeUndefined()
    expect(store.getState().records["u2"]?.outcome).toBe("dismissed")
  })
})
