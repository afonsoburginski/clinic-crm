# Repo map

| Serviço/domínio | Responsabilidade | Diretório | Entry point | Dependências | Relações |
|---|---|---|---|---|---|
| Villiére frontend | Interface Next.js; domínio e specs existentes; dados atualmente demo/localStorage | `frontend/` | Next.js (`frontend/package.json`) | Next, React, TanStack Query, Zod | Consumirá contratos compartilhados e API backend |
| Clinic API | API HTTP Hono em Bun; camadas domain/application/infrastructure/presentation | `backend/` | `backend/src/main.ts` | Hono, Bun, PostgreSQL (`pg`) | Consome contratos compartilhados |
| Contratos compartilhados | Tipos/contratos frontend-backend | `shared/contracts/` | `shared/contracts/src/index.ts` | — | Importável por frontend e backend |
