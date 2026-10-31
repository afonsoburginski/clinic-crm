# Build context is the monorepo root (frontend/ only needs itself, but keep consistent with backend/Dockerfile).
FROM oven/bun:1-slim AS deps
WORKDIR /app
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY frontend .
RUN bun run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
