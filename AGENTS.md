# Villiére

Project context is indexed in `.ai/repo-map.md`. Before changing code, read the relevant `.ai/services/<service>.md` and service specs. Specs lead implementation; keep business rules out of HTTP handlers. Backend uses Bun + Hono with domain/application/infrastructure/presentation boundaries. Shared API contracts belong in `shared/contracts/` and must remain framework-agnostic. Never commit secrets; use environment variables. Run the backend tests and typecheck before reporting changes.
