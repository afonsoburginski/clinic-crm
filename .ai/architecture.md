# Architecture

- `frontend/` is a Next.js demo app with domain rules in `frontend/domain/`; `frontend/specs/README.md` defines spec → domain → contract → UI and says Hono API was previously out of scope.
- `backend/` is being introduced as a separate Bun/Hono service, layered by domain, application, infrastructure, and presentation.
- Shared request/response contracts live outside both apps in `shared/contracts/`; frontend and backend may depend on these contracts, never on each other's internals.
- PostgreSQL is the intended durable store. Partitioning must be specified per high-volume time-series/read-model table and aligned with query predicates and uniqueness constraints before migrations are finalized.
