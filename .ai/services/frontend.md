# Frontend

- Next.js application in `frontend/`; package manifest names the frontend package `villiere`.
- Domain rules and interfaces live under `frontend/domain/`; existing business specs live in `frontend/specs/`.
- SDD convention: spec → domain → contract → module/UI, documented in `frontend/specs/README.md`.
- Shared frontend/backend contracts are in `shared/contracts/`; keep app branding as Villiére and do not derive product naming from the API package name.
- Validation commands are the scripts declared in `frontend/package.json`.
