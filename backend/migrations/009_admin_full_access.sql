-- The administrator role has full access (it revokes RN-AUTH-002, which kept `clinical:*` away from it).
-- Roles are seeded per clinic and an edited matrix is never overwritten, so clinics that already exist get every
-- permission of the catalog granted to their `admin` role here; the API keeps it in sync for permissions added later
-- (`effectivePermissions` and the seed derive the grants from the catalog). Idempotent.
INSERT INTO role_permissions (clinic_id, role_key, permission_key)
SELECT r.clinic_id, r.key, p.key
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'admin'
ON CONFLICT DO NOTHING;

-- The description seeded before this change says the role has no clinical access; update it unless the clinic edited it.
UPDATE roles
SET description = 'Acesso total à clínica, sem exceção.'
WHERE key = 'admin' AND description = 'Gestão administrativa da clínica; sem acesso clínico.';
