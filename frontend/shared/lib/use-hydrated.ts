import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/** `true` só no cliente, após a hidratação — evita divergência com dados do localStorage. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
