import { describe, expect, test } from "bun:test"
import type { AppointmentData, AppointmentFilters, AppointmentUpdateState, SchedulingRepository } from "@/application/ports/scheduling"
import { schedulingUseCases } from "@/application/use-cases/scheduling"

class FakeRepository implements SchedulingRepository {
  filters?: AppointmentFilters
  status: string | undefined = "confirmed"
  result: AppointmentData | undefined = { id: "a" }
  updatedStatus?: string
  conflicts = 0
  async list(_clinic: string, filters: AppointmentFilters) { this.filters = filters; return [] }
  async create() { return this.result }
  async get() { return this.result }
  async update(_clinic: string, _id: string, _input: AppointmentData, statusFor: (current: AppointmentUpdateState) => string) {
    this.updatedStatus = statusFor({ status: "confirmed", professionalId: "p1", patientId: "patient" })
    return this.result
  }
  async getStatus() { return this.status }
  async listForPatient() { return [] }
  async hasConflict() { return this.conflicts++ === 0 }
}

describe("scheduling use cases", () => {
  test("preserves list filters", async () => {
    const repository = new FakeRepository()
    const filters = { from: "2025-01-01", to: "2025-02-01", professional: "p", status: "pending", patient: "x" }
    await schedulingUseCases(repository).list("clinic", filters)
    expect(repository.filters).toEqual(filters)
  })
  test("validates creation and reports conflicts", async () => {
    const repository = new FakeRepository()
    const use = schedulingUseCases(repository)
    await expect(use.create("c", { start: "invalid" })).rejects.toThrow("validation")
    const input = { start: "2025-01-01T10:00:00Z", end: "2025-01-01T11:00:00Z", patientId: "p", serviceId: "s" }
    expect(await use.create("c", input)).toEqual({ id: "a" })
    repository.result = undefined
    await expect(use.create("c", input)).rejects.toThrow("conflict")
  })
  test("validates updates and resets confirmed status when the professional changes", async () => {
    const repository = new FakeRepository()
    const use = schedulingUseCases(repository)
    await expect(use.update("c", "a", {})).rejects.toThrow("validation")
    await use.update("c", "a", { start: "start", end: "end", professionalId: "p2" })
    expect(repository.updatedStatus).toBe("pending")
    await use.update("c", "a", { start: "start", end: "end" })
    expect(repository.updatedStatus).toBe("confirmed")
  })
  test("returns transitions and not found", async () => {
    const repository = new FakeRepository()
    const use = schedulingUseCases(repository)
    expect(await use.transitions("c", "a")).toEqual(["in_progress", "no_show", "cancelled"])
    repository.status = undefined
    await expect(use.transitions("c", "a")).rejects.toThrow("not_found")
    repository.result = undefined
    await expect(use.get("c", "a")).rejects.toThrow("not_found")
  })
  test("skips conflicts in suggestions and limits results", async () => {
    const repository = new FakeRepository()
    const slots = await schedulingUseCases(repository).suggestions("c", "2025-01-01T10:00:00Z", "60", "p", undefined)
    expect(slots).toHaveLength(10)
    expect(slots[0]).toEqual({ start: "2025-01-01T10:15:00.000Z", end: "2025-01-01T11:15:00.000Z" })
  })
})
