import { transitions } from "../../domain/appointments"
import type { AppointmentTransitionRepository, AppointmentTransitionResult } from "../ports/appointment-transitions"

export async function transitionAppointment(
  repository: AppointmentTransitionRepository,
  clinicId: string,
  appointmentId: string,
  status: string,
): Promise<AppointmentTransitionResult> {
  if (!Object.values(transitions).some((targets) => targets.includes(status))) throw new Error("validation")
  return repository.transaction(async (transaction) => {
    const current = await transaction.getStatus(clinicId, appointmentId)
    if (current === null) throw new Error("not_found")
    if (!transitions[current]?.includes(status)) throw new Error("validation")
    return transaction.setStatus(clinicId, appointmentId, status)
  })
}
