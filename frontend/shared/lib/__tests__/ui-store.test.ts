import { beforeEach, describe, expect, it } from "vitest"

import { useUiStore } from "../ui-store"

describe("useUiStore", () => {
  beforeEach(() => useUiStore.getState().closeAll())

  it("abre e fecha os overlays globais", () => {
    const ui = useUiStore.getState()
    ui.setMobileNavOpen(true)
    ui.toggleQuickSearch()
    ui.setDemoResetOpen(true)

    expect(useUiStore.getState()).toMatchObject({ mobileNavOpen: true, quickSearchOpen: true, demoResetOpen: true })

    useUiStore.getState().toggleQuickSearch()
    expect(useUiStore.getState().quickSearchOpen).toBe(false)
  })

  it("closeAll fecha tudo de uma vez (troca de perfil / saída)", () => {
    const ui = useUiStore.getState()
    ui.setMobileNavOpen(true)
    ui.setQuickSearchOpen(true)
    ui.setDemoResetOpen(true)

    useUiStore.getState().closeAll()

    expect(useUiStore.getState()).toMatchObject({ mobileNavOpen: false, quickSearchOpen: false, demoResetOpen: false })
  })
})
