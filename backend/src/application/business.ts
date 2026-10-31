import { query } from "@/infrastructure/database"
import { validateAppointment } from "@/domain/appointments"

export async function listAppointments(clinic: string, from?: string, to?: string, professional?: string, status?: string, patient?: string) {
 return query("SELECT id,kind,title,patient_id AS \"patientId\",professional_id AS \"professionalId\",service_id AS \"serviceId\",room_id AS \"roomId\",starts_at AS \"start\",ends_at AS \"end\",status,notes,created_by AS \"createdBy\" FROM appointments WHERE clinic_id=$1 AND ($2::timestamptz IS NULL OR starts_at >= $2) AND ($3::timestamptz IS NULL OR starts_at < $3) AND ($4::uuid IS NULL OR professional_id=$4) AND ($5::text IS NULL OR status=$5) AND ($6::uuid IS NULL OR patient_id=$6) ORDER BY starts_at",[clinic,from??null,to??null,professional??null,status??null,patient??null])
}

export async function createAppointment(clinic: string, p: Record<string, unknown>) {
  validateAppointment({kind:String(p.kind ?? "appointment"), startsAt:String(p.start ?? ""),endsAt:String(p.end ?? ""),status:String(p.status ?? "confirmed")})
  if (p.kind !== "block" && (!p.patientId || !p.serviceId)) throw new Error("validation")
  const result = await query("INSERT INTO appointments(clinic_id,kind,title,patient_id,professional_id,service_id,room_id,starts_at,ends_at,status,notes,created_by) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12 WHERE NOT EXISTS(SELECT 1 FROM appointments a WHERE a.clinic_id=$1 AND a.status NOT IN ('cancelled','no_show') AND a.starts_at<$9 AND a.ends_at>$8 AND (a.professional_id=$5 OR ($7::uuid IS NOT NULL AND a.room_id=$7 AND COALESCE((SELECT (r.payload->>'exclusive')::boolean FROM api_resources r WHERE r.clinic_id=$1 AND r.resource_type='room' AND r.id=$7),false)))) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM patients p WHERE p.clinic_id=$1 AND p.id=$4 AND p.status='active')) RETURNING id,kind,title,patient_id AS \"patientId\",professional_id AS \"professionalId\",starts_at AS \"start\",ends_at AS \"end\",status", [clinic,p.kind??"appointment",p.title??null,p.patientId??null,p.professionalId,p.serviceId??null,p.roomId??null,p.start,p.end,p.status??"confirmed",p.notes??null,p.actorId??"system"])
  if (!result.rowCount) throw new Error("conflict")
  return result.rows[0]
}

