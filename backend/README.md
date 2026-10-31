# Clinic API

API em Bun + Hono com PostgreSQL. Configure `PORT` (padrão `3001`), `DATABASE_URL` e `CLINIC_ID` (UUID). Aplique `migrations/001_initial.sql`, `migrations/002_business_core.sql` e `migrations/003_auth_sessions.sql` em ordem antes de iniciar com `bun run dev`.

## Arquitetura

Camadas `domain` → `application` (ports + use-cases) → `infrastructure` (repositórios Postgres) → `presentation` (routers Hono finos + composição). `src/presentation/app.ts` compõe `src/presentation/routes/api.ts`, que monta um router por contexto de negócio: auth, patients, scheduling, catalog, clinical-records, assessments, aba, financial, documents, dashboard. Cada contexto segue o mesmo layout: `application/ports/<nome>.ts` (interfaces, commands/queries), `application/use-cases/<nome>.ts` (regra pura, sem Hono/SQL), `infrastructure/postgres/repositories/<nome>.ts` (SQL), `presentation/composition/<nome>.ts` (fiação) e `presentation/routes/<nome>.ts` (router fino).

Aliases de import: `@/*` aponta para `backend/src/*`; `@contracts/*` aponta para `shared/contracts/src/*` (configurados em `tsconfig.json`, resolvidos nativamente pelo Bun).

Regras puras de agenda ficam em `src/domain/appointments.ts`, progresso de metas ABA em `src/domain/aba.ts` e regras financeiras em `src/domain/financial.ts`. A checagem de vínculo profissional-paciente é a porta `PatientAccessPolicy` (`application/ports/patient-access.ts`); a permissão por classificação de documento é `PermissionPolicy` (`application/ports/permissions.ts`).

`GET /health` e `GET /health/ready`; pacientes (listar, cadastrar, detalhe, editar, duplicados), responsáveis e vínculos; agenda (listar, criar, detalhe, reagendar, status/transições, sugestões e histórico por paciente); catálogo (especialidades, serviços, salas, profissionais, agenda/indisponibilidades, configurações, auditoria); prontuários clínicos com cadeia de versões/retificação; avaliações; planos e sessões ABA com progresso de metas; lançamentos financeiros com pagamentos/cancelamento/estorno; documentos com liberação/revogação a responsáveis; dashboard por período.

Autenticação usa usuários provisionados em `AUTH_USERS_JSON` (hashes de senha) e `AUTH_SESSION_SECRET` com no mínimo 32 caracteres; sessões são persistidas e revogáveis. Rotas desconhecidas sob `/api/v1` são negadas.

## Lacunas conhecidas (não são bypass de acesso)

- `createDocument`/`createEntry`/criações ABA aceitam `status`/`createdBy` enviados pelo cliente na criação (isolado em `application/use-cases/legacy-defaults.ts`).
- PATCH genérico de financial ainda permite sobrescrever `balanceCents`, `cancelledAt` e `cancelReason`.
- PATCH genérico de documents ainda aceita `id` e `createdBy` no corpo.
- Checagem de acesso em `updateDocument` roda antes do lock de linha (janela de corrida teórica).

## Deploy

`Dockerfile` (contexto de build é a raiz do monorepo, pois `@contracts/*` resolve para `shared/contracts/`) e `fly.toml` na raiz do repo. Build local: `docker build -f backend/Dockerfile -t villiere-api .` a partir da raiz.
