import { query } from "@/infrastructure/database";
import type { PatientsRepository } from "@/application/patients-repository";

export const postgresPatientsRepository: PatientsRepository = {
  list(clinicId, search, professional) {
    return query(
      "SELECT id,code,full_name AS \"fullName\",social_name AS \"socialName\",birth_date AS \"birthDat" +
        "e\",document,phone,email,status,main_professional_id AS \"mainProfessionalId\",consent_data AS " +
        "\"consentData\",consent_image AS \"consentImage\",administrative_notes AS \"administrativeNotes" +
        "\",created_at AS \"createdAt\",updated_at AS \"updatedAt\" FROM patients WHERE clinic_id=$1 AND" +
        " ($2::text IS NULL OR full_name ILIKE '%'||$2||'%' OR social_name ILIKE '%'||$2||'%' OR documen" +
        "t ILIKE '%'||$2||'%') AND ($3::uuid IS NULL OR (EXISTS(SELECT 1 FROM professionals pr WHERE pr." +
        "clinic_id=patients.clinic_id AND pr.id=$3 AND pr.active=true) AND (main_professional_id=$3 OR E" +
        "XISTS(SELECT 1 FROM appointments a WHERE a.clinic_id=patients.clinic_id AND a.patient_id=patien" +
        "ts.id AND a.professional_id=$3 AND a.kind='appointment' AND a.status IN ('confirmed','in_progre" +
        "ss','completed'))))) ORDER BY full_name",
      [clinicId, search ?? null, professional ?? null],
    );
  },
  create(clinicId, p) {
    return query(
      "INSERT INTO patients(clinic_id,full_name,social_name,birth_date,document,phone,email,status,mai" +
        "n_professional_id,consent_data,consent_image,administrative_notes) VALUES($1,$2,$3,$4,$5,$6,$7," +
        "$8,$9,$10,$11,$12) RETURNING id,'PAC-'||lpad(code::text,4,'0') AS code,full_name AS \"fullName" +
        "\",birth_date AS \"birthDate\",status,created_at AS \"createdAt\"",
      [
        clinicId, p.fullName, p.socialName ?? null, p.birthDate, p.document ?? null, p.phone ?? null, p.email ?? null,
        p.status ?? "active", p.mainProfessionalId ?? null, p.consentData ?? false, p.consentImage ?? false,
        p.administrativeNotes ?? null,
      ],
    );
  },
  duplicates(clinicId, document, birthDate, search) {
    return query(
          "SELECT id,'PAC-'||lpad(code::text,4,'0') AS code,full_name AS \"fullName\",birth_d" +
            'ate AS "birthDate" FROM patients WHERE clinic_id=$1 AND ((document IS NOT NULL A' +
            "ND document=$2) OR (birth_date=$3::date AND full_name % $4))",
          [clinicId, document ?? null, birthDate ?? null, search],
        );
  },
  get(clinicId, id, professional) {
    return query(
      'SELECT id,code,full_name AS "fullName",social_name AS "socialName",birth_date AS' +
        ' "birthDate",document,phone,email,status,main_professional_id AS "mainProfession' +
        'alId",consent_data AS "consentData",consent_image AS "consentImage",administrati' +
        've_notes AS "administrativeNotes" FROM patients WHERE clinic_id=$1 AND id=$2 AND' +
        " ($3::uuid IS NULL OR (EXISTS(SELECT 1 FROM professionals pr WHERE pr.clinic_id=" +
        "patients.clinic_id AND pr.id=$3 AND pr.active=true) AND (main_professional_id=$3" +
        " OR EXISTS(SELECT 1 FROM appointments a WHERE a.clinic_id=patients.clinic_id AND" +
        " a.patient_id=patients.id AND a.professional_id=$3 AND a.kind='appointment' AND " +
        "a.status IN ('confirmed','in_progress','completed')))))",
      [clinicId, id, professional ?? null],
    );
  },
  update(clinicId, id, p) {
    const keys = {
      fullName: "full_name",
      socialName: "social_name",
      birthDate: "birth_date",
      document: "document",
      phone: "phone",
      email: "email",
      status: "status",
      mainProfessionalId: "main_professional_id",
      consentData: "consent_data",
      consentImage: "consent_image",
      administrativeNotes: "administrative_notes",
    };
    const entries = Object.entries(keys).filter(([k]) => k in p);
    const sets = entries.map(([, v], i) => `${v}=$${i + 3}`).join(",");
    const vals = entries.map(([k]) => p[k]);
    return query(
      `UPDATE patients SET ${sets},updated_at=now() WHERE clinic_id=$1 AND id=$2 RETURNING id,full_name AS "fullName",status`,
      [clinicId, id, ...vals],
    );
  },
  listGuardians(clinicId) {
    return query("SELECT * FROM guardians WHERE clinic_id=$1 ORDER BY full_name", [clinicId]);
  },
  createGuardian(clinicId, p) {
    return query(
          "INSERT INTO guardians(clinic_id,full_name,document,phone,email) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [clinicId, p.fullName, p.document ?? null, p.phone, p.email ?? null],
        );
  },
  listPatientGuardians(clinicId, patientId) {
    return query("SELECT * FROM patient_guardians WHERE clinic_id=$1 AND ($2::uuid IS NULL OR patient_id=$2)", [
          clinicId,
          patientId ?? null,
        ]);
  },
  createPatientGuardian(clinicId, p) {
    return query(
      "INSERT INTO patient_guardians(clinic_id,patient_id,guardian_id,relationship,is_l" +
        "egal_guardian,can_schedule,can_receive_documents,is_primary_contact,restrictions" +
        ") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [
        clinicId,
        p.patientId,
        p.guardianId,
        p.relationship,
        !!p.isLegalGuardian,
        !!p.canSchedule,
        !!p.canReceiveDocuments,
        !!p.isPrimaryContact,
        p.restrictions ?? null,
      ],
    );
  },
  updatePatientGuardian(clinicId, id, p) {
    return query(
      "UPDATE patient_guardians SET relationship=COALESCE($3,relationship),is_legal_gua" +
        "rdian=COALESCE($4,is_legal_guardian),can_schedule=COALESCE($5,can_schedule),can_" +
        "receive_documents=COALESCE($6,can_receive_documents),is_primary_contact=COALESCE" +
        "($7,is_primary_contact),restrictions=COALESCE($8,restrictions) WHERE clinic_id=$" +
        "1 AND id=$2 RETURNING *",
      [
        clinicId,
        id,
        p.relationship,
        p.isLegalGuardian,
        p.canSchedule,
        p.canReceiveDocuments,
        p.isPrimaryContact,
        p.restrictions,
      ],
    );
  },
  deletePatientGuardian(clinicId, id) {
    return query<{
      patient_id: string;
      guardian_id: string;
    }>("DELETE FROM patient_guardians WHERE clinic_id=$1 AND id=$2 RETURNING id,patient_id,guardian_id", [
      clinicId,
      id,
    ]);
  },
  revokeReleases(clinicId, patientId, guardianId, actorId) {
    return query(
      "UPDATE api_resources d SET payload=jsonb_set(d.payload,'{releases}',COALESCE((SE" +
        "LECT jsonb_agg(CASE WHEN x->>'guardianId'=$3 AND x->>'active'='true' THEN x||jso" +
        "nb_build_object('active',false,'revokedAt',now(),'revokedBy',$4,'revokeReason','" +
        "V\u00EDnculo removido') ELSE x END) FROM jsonb_array_elements(COALESCE(d.payload->'re" +
        "leases','[]'::jsonb)) x),'[]'::jsonb)),updated_at=now() WHERE d.clinic_id=$1 AND" +
        " d.resource_type='document' AND d.payload->>'patientId'=$2 AND jsonb_path_exists" +
        "(d.payload,'$.releases[*] ? (@.guardianId == $g && @.active == true)',jsonb_buil" +
        "d_object('g',$3))",
      [clinicId, patientId, guardianId, actorId],
    );
  },
};
