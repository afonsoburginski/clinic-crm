import { create } from "zustand"

/**
 * Estado global de UI (overlays do shell). Dados de servidor ficam no TanStack Query,
 * sessão em `session-store`; Context só entrega dependências (providers.tsx).
 */
interface UiState {
  mobileNavOpen: boolean
  quickSearchOpen: boolean
  demoResetOpen: boolean
  tourOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  setQuickSearchOpen: (open: boolean) => void
  toggleQuickSearch: () => void
  setDemoResetOpen: (open: boolean) => void
  setTourOpen: (open: boolean) => void
  /** Fecha todos os overlays globais (troca de perfil, saída). */
  closeAll: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  mobileNavOpen: false,
  quickSearchOpen: false,
  demoResetOpen: false,
  tourOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setQuickSearchOpen: (quickSearchOpen) => set({ quickSearchOpen }),
  toggleQuickSearch: () => set((s) => ({ quickSearchOpen: !s.quickSearchOpen })),
  setDemoResetOpen: (demoResetOpen) => set({ demoResetOpen }),
  setTourOpen: (tourOpen) => set({ tourOpen }),
  closeAll: () => set({ mobileNavOpen: false, quickSearchOpen: false, demoResetOpen: false, tourOpen: false }),
}))
