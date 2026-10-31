import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SessionState {
  userId: string | null
  signIn: (userId: string) => void
  signOut: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      signIn: (userId) => set({ userId }),
      signOut: () => set({ userId: null }),
    }),
    { name: "clinica-demo-session" }
  )
)
