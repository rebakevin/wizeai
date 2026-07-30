# Build context is the repo root (this is a Bun workspaces monorepo — apps/web
# depends on packages/shared via workspace:*), so this image is built with:
#   docker build -f apps/web/Dockerfile .

FROM oven/bun:1 AS build

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/web build

# No VITE_* build args needed — the web app resolves its own origin and the
# API base URL from window.location at runtime, not at build time.

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
