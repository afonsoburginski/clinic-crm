import type { AppointmentTransitionRepository, AppointmentTransitionResult } from "../../../application/ports/appointment-transitions"
import { pool } from "../../database"

export const appointmentTransitions: AppointmentTransitionRepository = {
  async transaction(work) {
    if (!pool) throw new Error("database_unconfigured")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const result = await work({
        async getStatus(clinicId, appointmentId) {
          const row = await client.query<{ status: string }>(
            "SELECT status FROM appointments WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
            [clinicId, appointmentId],
          )
          return row.rows[0]?.status ?? null
        },
        async setStatus(clinicId, appointmentId, status) {
          const row = await client.query<AppointmentTransitionResult>(
            "UPDATE appointments SET status=$3,updated_at=now() WHERE clinic_id=$1 AND id=$2 RETURNING id,status",
            [clinicId, appointmentId, status],
          )
          return row.rows[0]!
        },
      })
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  },
}
