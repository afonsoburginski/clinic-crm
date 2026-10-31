import { describe, expect, it } from "bun:test"
import type { AppointmentTransitionRepository } from "@/application/ports/appointment-transitions"
import { transitionAppointment } from "@/application/use-cases/transition-appointment"

function repository(current: string | null) {
  const updates: string[] = []
  const port: AppointmentTransitionRepository = {
    async transaction(work) {
      return work({
        async getStatus() { return current },
        async setStatus(_clinic, id, status) {
          updates.push(status)
          return { id, status }
        },
      })
    },
  }
  return { port, updates }
}

describe("appointment transitions", () => {
  it("updates an allowed transition", async () => {
    const { port, updates } = repository("confirmed")
    expect(await transitionAppointment(port, "clinic", "appointment", "in_progress"))
      .toEqual({ id: "appointment", status: "in_progress" })
    expect(updates).toEqual(["in_progress"])
  })

  it("rejects disallowed transitions without updating", async () => {
    const { port, updates } = repository("completed")
    await expect(transitionAppointment(port, "clinic", "appointment", "confirmed")).rejects.toThrow("validation")
    expect(updates).toEqual([])
  })

  it("reports a missing appointment", async () => {
    const { port } = repository(null)
    await expect(transitionAppointment(port, "clinic", "missing", "confirmed")).rejects.toThrow("not_found")
  })
})
