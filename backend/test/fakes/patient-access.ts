import type { Actor, PatientAccessPolicy } from "@/application/ports/patient-access"

/** Mirrors the production policy: only professionals are restricted, and only to their linked patients. */
export class FakePatientAccess implements PatientAccessPolicy {
  linkedPatients = new Set<string>()
  checked: Array<{ patientId: string | undefined; actor: Actor }> = []

  async assertAccess(patientId: string | undefined, actor: Actor) {
    this.checked.push({ patientId, actor })
    if (!actor.roles.includes("professional")) return
    if (!actor.professionalId || !patientId || !this.linkedPatients.has(patientId)) throw new Error("forbidden")
  }
}
