# Frontend

- Next.js application in `frontend/`; package manifest names the frontend package `villiere`.
- Domain rules and interfaces live under `frontend/domain/`; existing business specs live in `frontend/specs/`.
- SDD convention: spec → domain → contract → module/UI, documented in `frontend/specs/README.md`.
- Data comes only from the real API: HTTP adapters live in `frontend/shared/api/` (`api.ts` composes `clinical-api.ts`, `financial-api.ts`, `documents-api.ts`; format translation in `*-mappers.ts`). There is no demo/localStorage data layer.
- Shared frontend/backend contracts are in `shared/contracts/`; keep app branding as Villiére and do not derive product naming from the API package name.
- Validation commands are the scripts declared in `frontend/package.json`.
