import type { AppointmentData, SchedulingRepository } from "../../../application/ports/scheduling"
import { pool, query } from "../../database"

export const schedulingRepository: SchedulingRepository = {
  async list(clinic, f) {
    return (await query<AppointmentData>('SELECT id,kind,title,patient_id AS "patientId",professional_id AS "professionalId",service_id AS "serviceId",room_id AS "roomId",starts_at AS "start",ends_at AS "end",status,notes,created_by AS "createdBy" FROM appointments WHERE clinic_id=$1 AND ($2::timestamptz IS NULL OR starts_at >= $2) AND ($3::timestamptz IS NULL OR starts_at < $3) AND ($4::uuid IS NULL OR professional_id=$4) AND ($5::text IS NULL OR status=$5) AND ($6::uuid IS NULL OR patient_id=$6) ORDER BY starts_at', [clinic,f.from??null,f.to??null,f.professional??null,f.status??null,f.patient??null])).rows
  },
  async create(clinic, p) {
    return (await query<AppointmentData>('INSERT INTO appointments(clinic_id,kind,title,patient_id,professional_id,service_id,room_id,starts_at,ends_at,status,notes,created_by) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12 WHERE NOT EXISTS(SELECT 1 FROM appointments a WHERE a.clinic_id=$1 AND a.status NOT IN (\'cancelled\',\'no_show\') AND a.starts_at<$9 AND a.ends_at>$8 AND (a.professional_id=$5 OR ($7::uuid IS NOT NULL AND a.room_id=$7 AND COALESCE((SELECT (r.payload->>\'exclusive\')::boolean FROM api_resources r WHERE r.clinic_id=$1 AND r.resource_type=\'room\' AND r.id=$7),false)))) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM patients p WHERE p.clinic_id=$1 AND p.id=$4 AND p.status=\'active\')) RETURNING id,kind,title,patient_id AS "patientId",professional_id AS "professionalId",starts_at AS "start",ends_at AS "end",status', [clinic,p.kind??"appointment",p.title??null,p.patientId??null,p.professionalId,p.serviceId??null,p.roomId??null,p.start,p.end,p.status??"confirmed",p.notes??null,p.actorId??"system"])).rows[0]
  },
  async get(clinic, id, professional) {
    return (await query<AppointmentData>('SELECT * FROM appointments WHERE clinic_id=$1 AND id=$2 AND ($3::uuid IS NULL OR professional_id=$3)', [clinic,id,professional??null])).rows[0]
  },
  async update(clinic, id, p, statusFor) {
    if (!pool) throw new Error("database_unconfigured")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const current = await client.query<{ status: string; professionalId: string | null; patientId: string | null }>(
        'SELECT status,professional_id AS "professionalId",patient_id AS "patientId" FROM appointments WHERE clinic_id=$1 AND id=$2 FOR UPDATE', [clinic,id],
      )
      if (!current.rows[0]) {
        await client.query("COMMIT")
        return undefined
      }
      const result = await client.query<AppointmentData>(
        `UPDATE appointments SET starts_at=$3,ends_at=$4,status=$7,professional_id=COALESCE($5::uuid,professional_id),patient_id=COALESCE($6::uuid,patient_id),updated_at=now() WHERE clinic_id=$1 AND id=$2 AND status NOT IN ('completed','cancelled','no_show') AND NOT EXISTS(SELECT 1 FROM appointments a WHERE a.clinic_id=$1 AND a.id<>$2 AND a.professional_id=COALESCE($5::uuid,appointments.professional_id) AND a.status NOT IN ('cancelled','no_show') AND a.starts_at<$4 AND a.ends_at>$3) RETURNING id,status,starts_at AS "start",ends_at AS "end"`,
        [clinic,id,p.start,p.end,p.professionalId??null,p.patientId??null,statusFor(current.rows[0])],
      )
      await client.query("COMMIT")
      return result.rows[0]
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  },
  async getStatus(clinic, id) {
    return (await query<{status: string}>('SELECT status FROM appointments WHERE clinic_id=$1 AND id=$2', [clinic,id])).rows[0]?.status
  },
  async listForPatient(clinic, patient) {
    return (await query<AppointmentData>('SELECT id,kind,professional_id AS "professionalId",service_id AS "serviceId",room_id AS "roomId",starts_at AS "start",ends_at AS "end",status FROM appointments WHERE clinic_id=$1 AND patient_id=$2 ORDER BY starts_at DESC', [clinic,patient])).rows
  },
  async hasConflict(clinic, professional, start, end, room) {
    const result = await query<AppointmentData>("SELECT 1 FROM appointments a WHERE a.clinic_id=$1 AND a.status NOT IN ('cancelled','no_show') AND a.starts_at<$4 AND a.ends_at>$3 AND (a.professional_id=$2 OR ($5::uuid IS NOT NULL AND a.room_id=$5 AND COALESCE((SELECT (r.payload->>'exclusive')::boolean FROM api_resources r WHERE r.clinic_id=$1 AND r.resource_type='room' AND r.id=$5),false))) UNION ALL SELECT 1 FROM api_resources r WHERE r.clinic_id=$1 AND r.resource_type='professional' AND r.id=$2 AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(r.payload->'unavailabilities','[]'::jsonb)) u WHERE (u->>'start')::timestamptz<$4 AND (u->>'end')::timestamptz>$3)", [clinic,professional,start,end,room??null])
    return (result.rowCount ?? 0) > 0
  },
}
