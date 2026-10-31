# Clinic API

API em Bun + Hono com PostgreSQL. Configure `PORT` (padrão `3001`), `DATABASE_URL` e `CLINIC_ID` (UUID). Aplique as migrations de `migrations/` em ordem (veja "Migrações") antes de iniciar com `bun run dev`.

## Arquitetura

Camadas `domain` → `application` (ports + use-cases) → `infrastructure` (repositórios Postgres) → `presentation` (routers Hono finos + composição). `src/presentation/app.ts` compõe `src/presentation/routes/api.ts`, que monta um router por contexto de negócio: auth, patients, scheduling, catalog, clinical-records, assessments, aba, financial, documents, dashboard. Cada contexto segue o mesmo layout: `application/ports/<nome>.ts` (interfaces, commands/queries), `application/use-cases/<nome>.ts` (regra pura, sem Hono/SQL), `infrastructure/postgres/repositories/<nome>.ts` (SQL), `presentation/composition/<nome>.ts` (fiação) e `presentation/routes/<nome>.ts` (router fino).

Aliases de import: `@/*` aponta para `backend/src/*`; `@contracts/*` aponta para `shared/contracts/src/*` (configurados em `tsconfig.json`, resolvidos nativamente pelo Bun).

Regras puras de agenda ficam em `src/domain/appointments.ts`, progresso de metas ABA em `src/domain/aba.ts` e regras financeiras em `src/domain/financial.ts`. A checagem de vínculo profissional-paciente é a porta `PatientAccessPolicy` (`application/ports/patient-access.ts`); a permissão por classificação de documento é `PermissionPolicy` (`application/ports/permissions.ts`).

`GET /health` e `GET /health/ready`; pacientes (listar, cadastrar, detalhe, editar, duplicados), responsáveis e vínculos; agenda (listar, criar, detalhe, reagendar, status/transições, sugestões e histórico por paciente); catálogo (especialidades, serviços, salas, profissionais, agenda/indisponibilidades, configurações, auditoria); prontuários clínicos com cadeia de versões/retificação; avaliações; planos e sessões ABA com progresso de metas; lançamentos financeiros com pagamentos/cancelamento/estorno; documentos com liberação/revogação a responsáveis; dashboard por período.

Autenticação lê os usuários do banco (`users` + `user_roles`) e exige `AUTH_SESSION_SECRET` com no mínimo 32 caracteres; sessões são persistidas e revogáveis. Usuário desativado perde a sessão na hora; redefinir a senha ou desativar também revoga as sessões. `AUTH_USERS_JSON` (opcional) é só bootstrap: se a clínica ainda não tem usuários, a lista é importada uma vez (upsert por e-mail, preservando hash e papéis; ids que não forem UUID ganham um novo, então sessões antigas pedem novo login). Rotas desconhecidas sob `/api/v1` são negadas.

Usuários, papéis e permissões (`backend/specs/users-roles.spec.md`): `GET/POST /users`, `GET/PATCH/DELETE /users/:id` (DELETE desativa, não apaga), `PUT /users/:id/roles`, `POST /users/:id/password`, `GET /roles`, `PUT /roles/:key/permissions`, `GET /permissions`. Leitura exige `users:read`, escrita `users:manage`. A matriz papel × permissão é editável e fica no banco por clínica; os padrões vêm de `src/domain/permissions.ts` (única fonte) e são semeados de forma idempotente no primeiro uso da clínica, sem sobrescrever matriz já editada. O papel `admin` nunca recebe `clinical:*` (RN-AUTH-002) e não perde `users:*`/`settings:manage`; a clínica sempre mantém ao menos um administrador ativo. Papéis são os 5 de sistema (admin, reception, professional, finance, manager); papéis customizados não existem. O cache da matriz dura 15 s por instância (invalidado na hora na instância que editou).

## Migrações

- `migrations/001…006_*.sql` são escritas à mão, aplicadas em ordem (`psql -f`) e definem as tabelas existentes. Uma base nova precisa de todas, em ordem; uma base já migrada só recebe as novas (a `006` usa `IF NOT EXISTS` e o seed do catálogo de permissões é idempotente).
- O ORM é o Drizzle (`drizzle-orm` sobre o `pg` existente, sem segundo pool). `src/infrastructure/postgres/schema.ts` espelha as tabelas das migrations 001–006 (as tabelas particionadas `audit_events` e `dashboard_daily` e os índices parciais ficam no SQL). `drizzle.config.ts` aponta para `migrations/drizzle/`.
- Baseline: `migrations/drizzle/0000_baseline.sql` não faz nada (`SELECT 1`) e o snapshot em `meta/` descreve o estado de 001–006; assim `bun run db:migrate` nunca recria tabela existente, em base nova (depois de 001–006) ou já migrada. Mudanças futuras: edite `schema.ts`, rode `bun run db:generate` (gera só o incremental), confira com `bun run db:check` e aplique com `bun run db:migrate` (precisa de `DATABASE_URL`). Seeds de migration só para papéis/permissões padrão, nunca dados de demonstração.
- Teste de repositório contra Postgres: `TEST_DATABASE_URL=postgres://… bun test test/users-repository.test.ts` (base com 001–006 aplicadas; ignorado sem a variável).

## Lacunas conhecidas (não são bypass de acesso)

- `createDocument`/`createEntry`/criações ABA aceitam `status`/`createdBy` enviados pelo cliente na criação (isolado em `application/use-cases/legacy-defaults.ts`).
- PATCH genérico de financial ainda permite sobrescrever `balanceCents`, `cancelledAt` e `cancelReason`.
- PATCH genérico de documents ainda aceita `id` e `createdBy` no corpo.
- Checagem de acesso em `updateDocument` roda antes do lock de linha (janela de corrida teórica).

## Deploy

`Dockerfile` (contexto de build é a raiz do monorepo, pois `@contracts/*` resolve para `shared/contracts/`) e `fly.toml` na raiz do repo. Build local: `docker build -f backend/Dockerfile -t villiere-api .` a partir da raiz.
