# Build context must be the monorepo root (../.. from here), because the backend
# resolves `@contracts/*` to the sibling `shared/contracts/src` via tsconfig paths.
FROM oven/bun:1-slim AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/bun.lock ./backend/
WORKDIR /app/backend
RUN bun install --frozen-lockfile --production

FROM base AS runtime
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY shared ./shared
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3001
CMD ["bun", "run", "start"]
