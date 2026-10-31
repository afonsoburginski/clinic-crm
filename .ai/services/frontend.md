# Frontend

- Next.js application in `frontend/`; package manifest names the frontend package `villiere`.
- Domain rules and interfaces live under `frontend/domain/`; existing business specs live in `frontend/specs/`.
- SDD convention: spec → domain → contract → module/UI, documented in `frontend/specs/README.md`.
- Data comes only from the real API: HTTP adapters live in `frontend/shared/api/` (`api.ts` composes `clinical-api.ts`, `financial-api.ts`, `documents-api.ts`; format translation in `*-mappers.ts`). There is no demo/localStorage data layer.
- Shared frontend/backend contracts are in `shared/contracts/`; keep app branding as Villiére and do not derive product naming from the API package name.
- Validation commands are the scripts declared in `frontend/package.json`.
- Users, roles and permissions: Configurações > Usuários / Papéis e permissões (`modules/users/`, tabs inside `modules/settings/components/settings-view.tsx`; spec `specs/modules/users-roles.spec.md`). The session user carries the effective `permissions` resolved by the API (role matrix stored in PostgreSQL); `domain/permissions.ts` keeps the catalog, labels and the default matrix, which is only a fallback for sessions without `permissions`. Author names (`createdBy` ids) are resolved through `shared/api/user-directory.ts` only for profiles with `users:read`.
