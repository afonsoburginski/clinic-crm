import { transitions, validateAppointment } from "../../domain/appointments"
import type { AppointmentData, AppointmentFilters, SchedulingRepository } from "../ports/scheduling"

export function schedulingUseCases(repository: SchedulingRepository) {
  return {
    list: (clinic: string, filters: AppointmentFilters) => repository.list(clinic, filters),
    async create(clinic: string, input: AppointmentData) {
      validateAppointment({ kind: String(input.kind ?? "appointment"), startsAt: String(input.start ?? ""), endsAt: String(input.end ?? ""), status: String(input.status ?? "confirmed") })
      if (input.kind !== "block" && (!input.patientId || !input.serviceId)) throw new Error("validation")
      const result = await repository.create(clinic, input)
      if (!result) throw new Error("conflict")
      return result
    },
    async get(clinic: string, id: string, professional?: string) {
      const result = await repository.get(clinic, id, professional)
      if (!result) throw new Error("not_found")
      return result
    },
    async update(clinic: string, id: string, input: AppointmentData) {
      if (!input.start || !input.end) throw new Error("validation")
      const result = await repository.update(clinic, id, input, (current) => {
        const professionalChanged = input.professionalId != null && current.professionalId !== null && current.professionalId !== input.professionalId
        const patientChanged = input.patientId != null && current.patientId !== null && current.patientId !== input.patientId
        return current.status === "confirmed" && (professionalChanged || patientChanged) ? "pending" : current.status
      })
      if (!result) throw new Error("conflict")
      return result
    },
    async transitions(clinic: string, id: string) {
      const status = await repository.getStatus(clinic, id)
      if (status === undefined) throw new Error("not_found")
      return transitions[status] ?? []
    },
    listForPatient: (clinic: string, patient: string) => repository.listForPatient(clinic, patient),
    async suggestions(clinic: string, startValue: string | undefined, duration: string | undefined, professional: string | undefined, room: string | undefined) {
      const start = Date.parse(startValue ?? "")
      if (!Number.isFinite(start)) throw new Error("validation")
      const rows: { start: string; end: string }[] = []
      for (let i = 0; i < 14 * 24 * 4 && rows.length < 10; i++) {
        const s = new Date(start + i * 15 * 60000)
        const e = new Date(s.getTime() + Number(duration ?? 60) * 60000)
        const slot = { start: s.toISOString(), end: e.toISOString() }
        if (!await repository.hasConflict(clinic, professional, slot.start, slot.end, room)) rows.push(slot)
      }
      return rows
    },
  }
}
