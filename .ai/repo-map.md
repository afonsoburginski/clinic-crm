# Repo map

| Serviço/domínio | Responsabilidade | Diretório | Entry point | Dependências | Relações |
|---|---|---|---|---|---|
| Villiére frontend | Interface Next.js; domínio e specs existentes; dados exclusivamente da API HTTP (sem demo/localStorage) | `frontend/` | Next.js (`frontend/package.json`) | Next, React, TanStack Query, Zod | Consome a API backend (`/api/v1`) e contratos compartilhados |
| Clinic API | API HTTP Hono em Bun; camadas domain/application/infrastructure/presentation | `backend/` | `backend/src/main.ts` | Hono, Bun, PostgreSQL (`pg`) | Consome contratos compartilhados |
| Contratos compartilhados | Tipos/contratos frontend-backend | `shared/contracts/` | `shared/contracts/src/index.ts` | — | Importável por frontend e backend |
