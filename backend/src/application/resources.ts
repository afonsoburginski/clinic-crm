import { query } from "@/infrastructure/database"

const safe = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {}

/** Used by the auth middleware to classify a document before gating access by role/permission. */
export async function getResource(c:string,t:string,id:string):Promise<any> { const r=await query<{payload:Record<string,any>}>('SELECT payload FROM api_resources WHERE clinic_id=$1 AND resource_type=$2 AND id=$3',[c,t,id]); if(!r.rowCount)throw new Error("not_found"); return {id,...safe(r.rows[0]!.payload)} }

export async function dashboard(c:string,from:string,to:string){const r=await query('SELECT count(*) FILTER (WHERE status NOT IN (\'cancelled\',\'no_show\'))::int AS "appointmentsTotal",count(*) FILTER (WHERE status=\'completed\')::int AS "appointmentsCompleted",count(*) FILTER (WHERE status=\'cancelled\')::int AS "appointmentsCancelled",count(DISTINCT patient_id)::int AS "patientsSeen",jsonb_build_object(\'from\',$2::date,\'to\',$3::date,\'appointmentsTotal\',count(*) FILTER (WHERE status NOT IN (\'cancelled\',\'no_show\')),\'appointmentsCompleted\',count(*) FILTER (WHERE status=\'completed\'),\'appointmentsCancelled\',count(*) FILTER (WHERE status=\'cancelled\')) AS metrics FROM appointments WHERE clinic_id=$1 AND starts_at >= $2::date AND starts_at < ($3::date+1)',[c,from,to]);return {period:{from,to},...r.rows[0]}}
