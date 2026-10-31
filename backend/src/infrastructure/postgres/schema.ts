import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/**
 * Drizzle mirror of the SQL migrations in `backend/migrations` (001–007). The SQL files are the source of truth
 * for what is applied; this file exists so queries are typed and `drizzle-kit generate` can diff what comes next.
 * Not expressible here: `audit_events` and `dashboard_daily` are range partitioned (with DEFAULT partitions) in SQL.
 */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" })

// ------------------------------------------------------------------ 001_initial

export const apiResources = pgTable(
  "api_resources",
  {
    clinicId: uuid("clinic_id").notNull(),
    resourceType: text("resource_type").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.resourceType, t.id] }),
    index("api_resources_lookup").on(t.clinicId, t.resourceType, t.updatedAt.desc()),
  ],
)

export const auditEvents = pgTable(
  "audit_events",
  {
    clinicId: uuid("clinic_id").notNull(),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
    id: uuid("id").notNull().defaultRandom(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id").notNull(),
    summary: text("summary").notNull(),
    changes: jsonb("changes"),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.occurredAt, t.id] }),
    index("audit_events_timeline").on(t.clinicId, t.occurredAt.desc(), t.resource, t.actorId),
  ],
)

export const dashboardDaily = pgTable(
  "dashboard_daily",
  {
    clinicId: uuid("clinic_id").notNull(),
    day: date("day").notNull(),
    professionalId: text("professional_id").notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.day, t.professionalId] }),
    index("dashboard_daily_lookup").on(t.clinicId, t.day, t.professionalId),
  ],
)

// ------------------------------------------------------------------ 002_business_core (+ 004 professionals contact)

export const professionals = pgTable(
  "professionals",
  {
    clinicId: uuid("clinic_id").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    specialtyIds: uuid("specialty_ids").array().notNull().default(sql`'{}'`),
    schedule: jsonb("schedule").notNull().default(sql`'[]'`),
    unavailabilities: jsonb("unavailabilities").notNull().default(sql`'[]'`),
    email: text("email"),
    phone: text("phone"),
    registry: text("registry"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    colorIndex: integer("color_index").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.id] }),
    check("professionals_specialty_ids_check", sql`cardinality(${t.specialtyIds}) > 0`),
  ],
)

export const patients = pgTable(
  "patients",
  {
    clinicId: uuid("clinic_id").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    code: bigint("code", { mode: "number" }).generatedByDefaultAsIdentity(),
    fullName: text("full_name").notNull(),
    socialName: text("social_name"),
    birthDate: date("birth_date").notNull(),
    document: text("document"),
    phone: text("phone"),
    email: text("email"),
    status: text("status").notNull().default("active"),
    mainProfessionalId: uuid("main_professional_id"),
    consentData: boolean("consent_data").notNull().default(false),
    consentImage: boolean("consent_image").notNull().default(false),
    administrativeNotes: text("administrative_notes"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.id] }),
    unique("patients_clinic_id_code_key").on(t.clinicId, t.code),
    check("patients_full_name_check", sql`length(trim(${t.fullName})) >= 3`),
    check("patients_status_check", sql`${t.status} IN ('active','inactive','archived')`),
    uniqueIndex("patients_document_unique").on(t.clinicId, t.document).where(sql`${t.document} IS NOT NULL`),
    index("patients_name_lookup").on(t.clinicId, sql`lower(${t.fullName})`),
    foreignKey({
      name: "patient_main_professional_fk",
      columns: [t.clinicId, t.mainProfessionalId],
      foreignColumns: [professionals.clinicId, professionals.id],
    }),
  ],
)

export const guardians = pgTable(
  "guardians",
  {
    clinicId: uuid("clinic_id").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    fullName: text("full_name").notNull(),
    document: text("document"),
    phone: text("phone").notNull(),
    email: text("email"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.clinicId, t.id] })],
)

export const patientGuardians = pgTable(
  "patient_guardians",
  {
    clinicId: uuid("clinic_id").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    patientId: uuid("patient_id").notNull(),
    guardianId: uuid("guardian_id").notNull(),
    relationship: text("relationship").notNull(),
    isLegalGuardian: boolean("is_legal_guardian").notNull().default(false),
    canSchedule: boolean("can_schedule").notNull().default(false),
    canReceiveDocuments: boolean("can_receive_documents").notNull().default(false),
    isPrimaryContact: boolean("is_primary_contact").notNull().default(false),
    restrictions: text("restrictions"),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.id] }),
    unique("patient_guardians_clinic_id_patient_id_guardian_id_key").on(t.clinicId, t.patientId, t.guardianId),
    uniqueIndex("one_primary_guardian").on(t.clinicId, t.patientId).where(sql`${t.isPrimaryContact}`),
    foreignKey({
      name: "patient_guardians_clinic_id_patient_id_fkey",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }),
    foreignKey({
      name: "patient_guardians_clinic_id_guardian_id_fkey",
      columns: [t.clinicId, t.guardianId],
      foreignColumns: [guardians.clinicId, guardians.id],
    }),
  ],
)

export const appointments = pgTable(
  "appointments",
  {
    clinicId: uuid("clinic_id").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    kind: text("kind").notNull(),
    title: text("title"),
    patientId: uuid("patient_id"),
    professionalId: uuid("professional_id").notNull(),
    serviceId: uuid("service_id"),
    roomId: uuid("room_id"),
    startsAt: timestamptz("starts_at").notNull(),
    endsAt: timestamptz("ends_at").notNull(),
    status: text("status").notNull(),
    notes: text("notes"),
    cancelReason: text("cancel_reason"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.id] }),
    check("appointments_kind_check", sql`${t.kind} IN ('appointment','block')`),
    check(
      "appointments_status_check",
      sql`${t.status} IN ('requested','pending','confirmed','in_progress','completed','cancelled','no_show')`,
    ),
    check("appointments_check", sql`${t.endsAt} > ${t.startsAt}`),
    index("appointments_agenda")
      .on(t.clinicId, t.professionalId, t.startsAt)
      .where(sql`${t.status} NOT IN ('cancelled','no_show')`),
    foreignKey({
      name: "appointments_clinic_id_patient_id_fkey",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }),
    foreignKey({
      name: "appointments_clinic_id_professional_id_fkey",
      columns: [t.clinicId, t.professionalId],
      foreignColumns: [professionals.clinicId, professionals.id],
    }),
  ],
)

// ------------------------------------------------------------------ 003_auth_sessions

export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_expiry").on(t.userId, t.expiresAt)],
)

export const authLoginLockouts = pgTable("auth_login_lockouts", {
  emailHash: text("email_hash").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: timestamptz("window_started_at").notNull().defaultNow(),
  lockedUntil: timestamptz("locked_until"),
})

// ------------------------------------------------------------------ 006_users_roles_permissions

export const users = pgTable(
  "users",
  {
    clinicId: uuid("clinic_id").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    professionalId: uuid("professional_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.id] }),
    check("users_name_check", sql`length(trim(${t.name})) >= 2`),
    uniqueIndex("users_email_unique").on(t.clinicId, sql`lower(${t.email})`),
    foreignKey({
      name: "users_professional_fk",
      columns: [t.clinicId, t.professionalId],
      foreignColumns: [professionals.clinicId, professionals.id],
    }),
  ],
)

/** Global catalog of the permission keys the guard knows (seeded by the migration and kept in sync at boot). */
export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  groupLabel: text("group_label").notNull(),
})

export const roles = pgTable(
  "roles",
  {
    clinicId: uuid("clinic_id").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    isSystem: boolean("is_system").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.clinicId, t.key] })],
)

export const rolePermissions = pgTable(
  "role_permissions",
  {
    clinicId: uuid("clinic_id").notNull(),
    roleKey: text("role_key").notNull(),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.roleKey, t.permissionKey] }),
    foreignKey({
      name: "role_permissions_role_fk",
      columns: [t.clinicId, t.roleKey],
      foreignColumns: [roles.clinicId, roles.key],
    }).onDelete("cascade"),
  ],
)

export const userRoles = pgTable(
  "user_roles",
  {
    clinicId: uuid("clinic_id").notNull(),
    userId: uuid("user_id").notNull(),
    roleKey: text("role_key").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.userId, t.roleKey] }),
    index("user_roles_role").on(t.clinicId, t.roleKey),
    foreignKey({
      name: "user_roles_user_fk",
      columns: [t.clinicId, t.userId],
      foreignColumns: [users.clinicId, users.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "user_roles_role_fk",
      columns: [t.clinicId, t.roleKey],
      foreignColumns: [roles.clinicId, roles.key],
    }),
  ],
)

// ------------------------------------------------------------------ 007_table_preferences

/** Saved views of a data table, per user: `default` holds the working preferences, any other name is a saved view. */
export const userTablePreferences = pgTable(
  "user_table_preferences",
  {
    clinicId: uuid("clinic_id").notNull(),
    userId: uuid("user_id").notNull(),
    tableKey: text("table_key").notNull(),
    viewName: text("view_name").notNull().default("default"),
    pageSize: integer("page_size"),
    sort: jsonb("sort").notNull().default(sql`'[]'::jsonb`),
    hiddenColumns: jsonb("hidden_columns").notNull().default(sql`'[]'::jsonb`),
    columnOrder: jsonb("column_order").notNull().default(sql`'[]'::jsonb`),
    filters: jsonb("filters").notNull().default(sql`'{}'::jsonb`),
    isDefault: boolean("is_default").notNull().default(false),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.userId, t.tableKey, t.viewName] }),
    check("user_table_preferences_key_check", sql`${t.tableKey} ~ '^[a-z0-9-]{1,60}$'`),
    check("user_table_preferences_view_check", sql`length(trim(${t.viewName})) BETWEEN 1 AND 40`),
    check("user_table_preferences_page_size_check", sql`${t.pageSize} IS NULL OR ${t.pageSize} BETWEEN 1 AND 200`),
    uniqueIndex("user_table_preferences_one_default")
      .on(t.clinicId, t.userId, t.tableKey)
      .where(sql`${t.isDefault}`),
    foreignKey({
      name: "user_table_preferences_user_fk",
      columns: [t.clinicId, t.userId],
      foreignColumns: [users.clinicId, users.id],
    }).onDelete("cascade"),
  ],
)
