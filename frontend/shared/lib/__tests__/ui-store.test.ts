import { beforeEach, describe, expect, it } from "vitest"

import { useUiStore } from "../ui-store"

describe("useUiStore", () => {
  beforeEach(() => useUiStore.getState().closeAll())

  it("abre e fecha os overlays globais", () => {
    const ui = useUiStore.getState()
    ui.setMobileNavOpen(true)
    ui.toggleQuickSearch()
    ui.setTourOpen(true)

    expect(useUiStore.getState()).toMatchObject({ mobileNavOpen: true, quickSearchOpen: true, tourOpen: true })

    useUiStore.getState().toggleQuickSearch()
    expect(useUiStore.getState().quickSearchOpen).toBe(false)
  })

  it("closeAll fecha tudo de uma vez (troca de perfil / saída)", () => {
    const ui = useUiStore.getState()
    ui.setMobileNavOpen(true)
    ui.setQuickSearchOpen(true)
    ui.setTourOpen(true)

    useUiStore.getState().closeAll()

    expect(useUiStore.getState()).toMatchObject({ mobileNavOpen: false, quickSearchOpen: false, tourOpen: false })
  })
})
