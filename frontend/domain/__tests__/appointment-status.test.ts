import { describe, expect, it } from "vitest"

import { availableTransitions, canTransition, canUserTransition, isTerminal } from "../appointment-status"
import type { User } from "../types"

const reception: User = { id: "r", name: "R", email: "r@r", title: "", roles: ["reception"] }
const helena: User = { id: "h", name: "H", email: "h@h", title: "", roles: ["professional"], professionalId: "p1" }

describe("AGD — máquina de estados", () => {
  it("segue as transições documentadas", () => {
    expect(canTransition("requested", "confirmed")).toBe(true)
    expect(canTransition("confirmed", "in_progress")).toBe(true)
    expect(canTransition("in_progress", "completed")).toBe(true)
    expect(canTransition("pending", "in_progress")).toBe(false)
    expect(canTransition("in_progress", "cancelled")).toBe(false)
  })

  it("CA-AGD-005 · estados terminais não têm saída", () => {
    for (const s of ["completed", "cancelled", "no_show"] as const) {
      expect(isTerminal(s)).toBe(true)
      expect(availableTransitions(reception, { status: s, professionalId: "p1" })).toEqual([])
    }
  })

  it("RN-AGD-012 · profissional só inicia, conclui ou registra falta nos próprios", () => {
    const own = { status: "confirmed" as const, professionalId: "p1" }
    expect(availableTransitions(helena, own).sort()).toEqual(["in_progress", "no_show"])
    expect(canUserTransition(helena, own, "cancelled")).toBe(false)
    expect(canUserTransition(helena, { ...own, professionalId: "p2" }, "in_progress")).toBe(false)
  })

  it("RN-AGD-011 · recepção pode cancelar", () => {
    expect(canUserTransition(reception, { status: "pending", professionalId: "p1" }, "cancelled")).toBe(true)
  })
})
