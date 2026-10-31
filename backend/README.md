# Clinic API

API em Bun + Hono com PostgreSQL. Configure `PORT` (padrão `3001`), `DATABASE_URL` e `CLINIC_ID` (UUID). Aplique `migrations/001_initial.sql`, `migrations/002_business_core.sql` e `migrations/003_auth_sessions.sql` em ordem antes de iniciar com `bun run dev`.

## Implementação atual

O ponto de entrada HTTP é `src/presentation/app.ts`, que compõe o roteador exportado
por `src/presentation/routes/api.ts`. O arquivo de rotas concentra temporariamente os
handlers; a separação em routers por contexto segue pendente. Regras puras de agenda
ficam em `src/domain/appointments.ts` e as regras financeiras em
`src/domain/financial.ts`. Os contratos compartilhados contêm tipos, sem inventário
de rotas duplicado.

`GET /health` e `GET /health/ready`; pacientes (listar, cadastrar, detalhe, editar, duplicados), responsáveis e vínculos; agenda (listar, criar, detalhe, reagendar, status/transições, sugestões e histórico por paciente); coleções JSONB para catálogo, prontuários, avaliações, ABA, financeiro, documentos e configurações; dashboard por período e auditoria com redação dos recursos clínicos. As coleções JSONB são armazenadas em `api_resources` e as consultas/mutações incluem `clinic_id`.

Autenticação usa usuários provisionados em `AUTH_USERS_JSON` (hashes de senha) e `AUTH_SESSION_SECRET` com no mínimo 32 caracteres; sessões são persistidas e revogáveis. Rotas desconhecidas sob `/api/v1` são negadas. Permissões por papel incluem restrição clínica para admin e leitura clínica conforme classificação documental. Catálogos usam `active=false` como desativação lógica e suportam filtros `patientId`, `status`, `from` e `to`. O dashboard agrega consultas de agenda para o intervalo solicitado.

As operações de agenda, política clínica e financeira ainda exigem revisão de domínio e integração antes de exposição pública. Em especial, não há requisito definido no backend para fórmula/unidade de progresso ABA, política de consentimento para documento clínico e semântica de métricas financeiras do dashboard.

As regras detalhadas do produto estão em `../frontend/specs/modules/`. O backend ainda requer integração dessas regras antes de ser considerado completo.
