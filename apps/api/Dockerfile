# Build context is the repo root (this is a Bun workspaces monorepo — apps/api
# depends on packages/shared via workspace:*), so this image is built with:
#   docker build -f apps/api/Dockerfile .

FROM oven/bun:1

WORKDIR /app

# Not `--production`: drizzle-kit (a devDependency) is needed at runtime to
# run migrations before the server starts.
COPY . .
RUN bun install --frozen-lockfile

WORKDIR /app/apps/api

ENV NODE_ENV=production
EXPOSE 3001

# Applies any pending Drizzle migrations before booting — a fresh clone's
# `docker compose up` should end with a ready-to-use schema, not an empty
# database. Safe to run on every start: drizzle-kit only applies migrations
# that haven't already been recorded.
CMD ["sh", "-c", "bunx drizzle-kit migrate && bun run src/server.ts"]
