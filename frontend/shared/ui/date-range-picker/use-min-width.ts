"use client"

import { useSyncExternalStore } from "react"

/** `true` quando a janela tem ao menos `px` de largura (no servidor e antes da hidratação: `false`, mobile-first). */
export function useMinWidth(px: number) {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(`(min-width: ${px}px)`)
      query.addEventListener("change", notify)
      return () => query.removeEventListener("change", notify)
    },
    () => window.matchMedia(`(min-width: ${px}px)`).matches,
    () => false
  )
}
