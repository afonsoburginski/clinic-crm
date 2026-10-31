# Clinic API

- Purpose: Villiére HTTP API using Hono on Bun and PostgreSQL persistence.
- Entrypoint: `backend/src/main.ts`; scripts: `bun run dev`, `bun test`, `bun run typecheck`.
- Data design: don't partition OLTP entities speculatively. Use time partitioning for append-heavy audit/events and dashboard read-models only when query shape, retention, and uniqueness are specified; dashboard aggregates should have explicit period/tenant keys and indexes.
- Current code map: `presentation/app.ts` composes the API router in `presentation/routes/api.ts`; handlers are still concentrated in that router. Pure scheduling rules live in `domain/appointments.ts`; financial rules live in `domain/financial.ts`. Resource persistence currently remains JSONB based in `application/resources.ts` and needs further extraction behind ports.
- `shared/contracts/src/api.ts` contains framework-independent data types; route inventories are deliberately not duplicated there.
