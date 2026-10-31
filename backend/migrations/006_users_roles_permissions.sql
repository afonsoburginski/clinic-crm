-- Users, roles and permissions live in the database (they came from AUTH_USERS_JSON and hardcoded grants).
-- The permission catalog is global and seeded here. Roles and their default permissions are per clinic: the
-- migration does not know CLINIC_ID, so the API seeds them idempotently from the defaults in
-- `src/domain/permissions.ts` the first time a clinic is used (an edited matrix is never overwritten).

CREATE TABLE IF NOT EXISTS users (
  clinic_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) >= 2),
  email text NOT NULL,
  password_hash text NOT NULL,
  professional_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id),
  CONSTRAINT users_professional_fk FOREIGN KEY (clinic_id, professional_id) REFERENCES professionals (clinic_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (clinic_id, lower(email));

CREATE TABLE IF NOT EXISTS permissions (
  key text PRIMARY KEY,
  label text NOT NULL,
  group_label text NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  clinic_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  PRIMARY KEY (clinic_id, key)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  clinic_id uuid NOT NULL,
  role_key text NOT NULL,
  permission_key text NOT NULL REFERENCES permissions (key),
  PRIMARY KEY (clinic_id, role_key, permission_key),
  CONSTRAINT role_permissions_role_fk FOREIGN KEY (clinic_id, role_key) REFERENCES roles (clinic_id, key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
  clinic_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_key text NOT NULL,
  PRIMARY KEY (clinic_id, user_id, role_key),
  CONSTRAINT user_roles_user_fk FOREIGN KEY (clinic_id, user_id) REFERENCES users (clinic_id, id) ON DELETE CASCADE,
  CONSTRAINT user_roles_role_fk FOREIGN KEY (clinic_id, role_key) REFERENCES roles (clinic_id, key)
);
CREATE INDEX IF NOT EXISTS user_roles_role ON user_roles (clinic_id, role_key);

INSERT INTO permissions (key, label, group_label) VALUES
  ('dashboard:read', 'Ver o painel', 'Painel'),
  ('patients:read', 'Ver todos os pacientes', 'Pacientes'),
  ('patients:read-own', 'Ver apenas os próprios pacientes', 'Pacientes'),
  ('patients:write', 'Cadastrar e editar pacientes', 'Pacientes'),
  ('guardians:write', 'Cadastrar e editar responsáveis', 'Pacientes'),
  ('appointments:read', 'Ver toda a agenda', 'Agenda'),
  ('appointments:read-own', 'Ver apenas a própria agenda', 'Agenda'),
  ('appointments:write', 'Criar e reagendar atendimentos', 'Agenda'),
  ('appointments:cancel', 'Cancelar atendimentos', 'Agenda'),
  ('appointments:status-own', 'Atualizar o status dos próprios atendimentos', 'Agenda'),
  ('professionals:manage', 'Gerir profissionais', 'Cadastros'),
  ('services:manage', 'Gerir serviços', 'Cadastros'),
  ('rooms:manage', 'Gerir salas', 'Cadastros'),
  ('clinical:read', 'Ler prontuários e dados clínicos', 'Clínico'),
  ('clinical:write', 'Registrar prontuários e dados clínicos', 'Clínico'),
  ('assessments:interpret', 'Interpretar avaliações', 'Clínico'),
  ('finance:read', 'Ver o financeiro', 'Financeiro'),
  ('finance:write', 'Lançar, baixar e estornar no financeiro', 'Financeiro'),
  ('documents:read', 'Ver documentos', 'Documentos'),
  ('settings:manage', 'Gerir as configurações da clínica', 'Administração'),
  ('audit:read', 'Ver a auditoria', 'Administração'),
  ('team:invite', 'Convidar a equipe', 'Administração'),
  ('users:read', 'Ver usuários e papéis', 'Administração'),
  ('users:manage', 'Gerir usuários e papéis', 'Administração')
ON CONFLICT (key) DO NOTHING;
