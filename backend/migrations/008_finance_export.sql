-- `finance:export` gates the XLSX export of the financial entries (GET /api/v1/financial/export).
-- The catalog is global. Roles are seeded per clinic from `src/domain/permissions.ts` the first time a clinic is
-- used and an edited matrix is never overwritten, so clinics that were already seeded get the permission here:
-- it is granted to the administrator and finance roles, which hold it by default. Permission catalog only.
INSERT INTO permissions (key, label, group_label) VALUES
  ('finance:export', 'Exportar o financeiro (XLSX)', 'Financeiro')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (clinic_id, role_key, permission_key)
SELECT clinic_id, key, 'finance:export'
FROM roles
WHERE key IN ('admin', 'finance')
ON CONFLICT DO NOTHING;
