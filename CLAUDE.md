# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Wize AI's MVP: one job — never let a student miss an assignment deadline. It reads Canvas
assignments, breaks them into study tasks with an AI planner, schedules them on Google Calendar,
and lets the student talk to it over WhatsApp. Canvas and Google Calendar are still **mocked stub
integrations** (fixture data / in-memory state). **WhatsApp is a real integration** (Meta's Cloud
API) and is currently the only way an end user is meant to talk to the agent — anyone who messages
the configured WhatsApp number gets a real conversation with the same Google ADK agent used by
`POST /api/agent/chat`, with no login/account association yet. There is no dashboard; the web app
only covers auth + connecting integrations (Canvas/Calendar/WhatsApp account-linking, separate from
and not yet used by the WhatsApp chat flow).

## Commands

Bun is the runtime and the only package manager — don't use npm/pnpm/yarn.

```bash
bun install                    # install everything (workspaces)
docker compose up -d           # start local Postgres — do this before running the API

bun run dev:api                # apps/api on :3001 (bun --watch)
bun run dev:web                # apps/web on :5173 (vite, proxies /api -> :3001)

bun run lint                   # eslint across the whole repo (flat config at root)
bun run format                 # prettier --write across the whole repo
```

Per-app, run with `--cwd`, e.g. `bun run --cwd apps/api <script>`, or `cd` into the app first:

```bash
# apps/api
bun run --cwd apps/api typecheck        # tsc --noEmit
bun run --cwd apps/api db:generate      # drizzle-kit generate (new migration from schema.ts)
bun run --cwd apps/api db:migrate       # drizzle-kit migrate (apply migrations)

# apps/web
bun run --cwd apps/web build            # tsc -b && vite build
```

There is no test suite yet. Type-checking is per-app (`tsc -b` for apps/web's project
references, `tsc --noEmit -p tsconfig.json` for apps/api and packages/shared) — there's no
single root-level typecheck command.

Postgres and both dev servers do **not** survive a machine/Docker restart — if `bun run dev:api`
fails with a Postgres connection error, run `docker compose up -d` first.

### Environment

Copy `apps/api/.env.example` to `apps/api/.env`. Required: `DATABASE_URL` (matches
`docker-compose.yml`'s `wizeai`/`wizeai`/`wizeai` creds on `localhost:5432`), `GEMINI_API_KEY`,
`BETTER_AUTH_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_VERIFY_TOKEN` (server won't boot without these — see the WhatsApp section below for
where they come from). Optional: `WEB_ORIGIN` (defaults to `http://localhost:5173`, used for CORS
+ Better Auth trusted origins), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Google social login —
social provider is only registered if `GOOGLE_CLIENT_ID` is set), `WHATSAPP_APP_SECRET` (enables
webhook signature verification when set — skipped with a warning if empty), `WHATSAPP_API_VERSION`
(defaults `v21.0`), `PORT` (defaults 3001).

**The Gemini env var is `GEMINI_API_KEY`, not `GOOGLE_API_KEY`** — the installed `@google/adk`
version reads `GEMINI_API_KEY` or `GOOGLE_GENAI_API_KEY` from `process.env` directly (bypassing
`apps/api/src/config/env.ts`'s own validated `env` object); Google's own docs for a different ADK
version say `GOOGLE_API_KEY`, which does not work here. Verify against the installed version if
this ever seems broken again: `grep -n "GEMINI_API_KEY\|GOOGLE_GENAI_API_KEY" node_modules/@google/adk/dist/esm/models/google_llm.js`.

## Architecture

Bun workspaces monorepo: `apps/api` (Bun + Express), `apps/web` (Vite + React), `packages/shared`
(Zod schemas + inferred types + date utils, consumed by both apps via `@wizeai/shared`,
`@wizeai/shared/schemas`, `@wizeai/shared/types`, `@wizeai/shared/utils`). No build step for
`packages/shared` — both Bun and Vite transpile its TypeScript directly from source.

### apps/api

Feature-folder layout under `src/`: `auth/`, `canvas/`, `calendar/`, `whatsapp/`, `planner/`,
`scheduler/`, `assistant/`, each with a `routes.ts`. Canvas/Calendar still follow a `*Client`
interface + `mock*Client` implementation pattern; WhatsApp has a `realWhatsappClient.ts` instead
(see below). `routes/index.ts` wires all the feature routers onto one `apiRouter`, mounted at
`/api` in `app.ts`. `db/schema.ts` is the single Drizzle source of truth; `config/env.ts`
validates `process.env` with Zod at import time (fails fast on boot if a required var is missing).

- **Auth**: Better Auth, mounted via `toNodeHandler` at `/api/auth/*splat` — mounted *before*
  `express.json()` (Better Auth needs the raw body; applying `express.json()` first breaks it).
  Drizzle adapter uses `usePlural: true` so the auth tables can be named `users`/`sessions`/
  `accounts`/`verifications` (plural) instead of Better Auth's singular defaults, matching this
  project's other table names. The `openAPI()` plugin is enabled — its own reference UI is at
  `/api/auth/reference`.
- **Mock integrations**: Canvas/Calendar `/connect`, `/disconnect`, `/sync` routes write real
  connection rows to Postgres but return fixture/in-memory data (see each `mock*Client.ts`). These
  operate against one seeded `DEMO_USER_ID` (`src/lib/demoUser.ts`) rather than a real session
  user — they aren't wired to Better Auth sessions yet. WhatsApp's `/connect` route is the same
  (DB row, unused so far) but WhatsApp's actual chat flow (below) is real.
- **WhatsApp** (`whatsapp/`): real integration via Meta's Cloud API.
  `graphClient.ts.sendText()` POSTs to `graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages`.
  `realWhatsappClient.receiveWebhook()` parses Meta's `entry[].changes[].value.messages[]` shape
  and, for each text message, calls `assistant/assistantService.chat()` using the sender's phone
  number (`wa_id`) directly as the chat `userId` — no account lookup. `routes.ts`'s
  `POST /webhook` **acks 200 immediately** and processes/replies asynchronously (Meta expects a
  fast response; the agent call can take several seconds) and verifies `X-Hub-Signature-256`
  against `WHATSAPP_APP_SECRET` when that env var is set (skipped with a one-time warning
  otherwise) — signature verification needs the raw body, captured via `express.json()`'s
  `verify` callback in `app.ts` (`req.rawBody`). `GET /webhook` is Meta's one-time verification
  handshake, checked against `WHATSAPP_VERIFY_TOKEN`. `POST /send` is a dev-only route for testing
  outbound sends without needing an inbound message first. WhatsApp is not reachable from Meta
  without a public HTTPS tunnel to your local server (e.g. `ngrok http 3001`) — Meta cannot call
  `localhost`.
- **Assistant** (`assistant/`): the general-purpose conversational agent — `POST /api/agent/chat`
  and the WhatsApp flow above both go through `assistantService.chat(userId, message)`. Unlike
  the Planner, this agent has `tools` (`tools.ts`, built with ADK's `FunctionTool` + Zod
  `parameters`, not Gemini's `Schema`/`Type`) and a **persistent** per-`userId` session
  (`InMemorySessionService.getOrCreateSession` + `Runner.runAsync`, not `runEphemeral`) so it
  remembers earlier turns (e.g. "why did you split it up that way?"). Tools read/write
  conversation state via `toolContext.state.get/set` — e.g. `breakdown_assignment` stores the
  generated task list under `current_tasks` so `reschedule_tasks`/`cancel_tasks` can find it later
  without a database. **`newMessage` passed to ADK's `Runner`/`InMemoryRunner` must include
  `role: "user"`** (`{ role: "user", parts: [...] }`) — omitting it doesn't error, but the model
  silently fails to see the actual message and returns generic filler disconnected from the input
  (this caused a real, confusing bug in both `plannerService.ts` and `assistantService.ts` before
  it was found by testing the raw `@google/genai` SDK directly to isolate ADK as the cause).
- **Planner** (`planner/`): `agent.ts` defines a Google ADK `LlmAgent`
  (`gemini-flash-latest`) with a JSON `outputSchema` (Gemini's `Type`/`Schema`, not Zod — see
  `planner/schema.ts`) forcing structured task-breakdown output. `plannerService.ts` runs it via
  `InMemoryRunner.runEphemeral()`, reads the final response with `isFinalResponse`/
  `stringifyContent`, then validates the parsed JSON against the shared `TaskBreakdownSchema`
  before persisting `tasks` rows. If ADK's TS API surface ever seems to not match what's here,
  check `node_modules/@google/adk/dist/types/` directly — the published docs are Python-first and
  the TS surface has diverged in places (see the `GEMINI_API_KEY` note above).
- **Scheduler**: the only other non-mocked logic — `schedulerService.ts` does real free-slot-finding
  (`subtractBusyBlocks` from `@wizeai/shared/utils`) over the mock Calendar client's busy blocks,
  then greedily places tasks and calls back into the mock client to "create" the resulting events.
- **OpenAPI docs**: `src/openapi.ts` builds a `@asteasolutions/zod-to-openapi` registry directly
  from the same Zod schemas used for request validation (each route file exports its own request
  schema for this reason — don't redefine them ad hoc in `openapi.ts`). Served at `/api/docs`
  (Swagger UI) and `/api/openapi.json`. Two gotchas if you touch this: (1) Swagger UI's HTML has an
  inline `<script>`, so `/api/docs` gets its own `helmet({ contentSecurityPolicy: false })`
  override; (2) `registry.register(name, schema)` (named/reusable component schemas) requires Zod
  v4's `.meta()`, not `extendZodWithOpenApi`/`.openapi()` — passing schemas straight into
  `registerPath({ request/responses })` works fine either way, so prefer that over `.register()`.
- **Express 5 + `helmet`/Better Auth typing**: `helmet()`'s and Better Auth's `toNodeHandler`
  return values are typed against plain `node:http`, which doesn't structurally satisfy Express
  5's `Request`/`Response` under newer `@types/node` (`signal` property mismatch). `app.ts` has an
  `asHandler()` cast helper for this — reuse it rather than re-deriving the same `as unknown as
  RequestHandler` dance elsewhere.

### apps/web

Vite + React 19 + React Router (declarative `<Routes>` in `App.tsx`) + TanStack Query + React Hook
Form + Zod + Tailwind v4 + shadcn/ui (Nova preset, Base UI primitives — **not** Radix; polymorphic
rendering uses the `render` prop, e.g. `<Button render={<Link .../>} nativeButton={false} />`, not
`asChild`). Path alias `@/*` → `src/*` (set in both `tsconfig.app.json` and `vite.config.ts`).

Screens only cover auth + connecting integrations (Landing, Signup, Login, Account, Connect
Canvas/Calendar/WhatsApp) — no assignment/dashboard UI by design.

- **Auth client** (`lib/authClient.ts`): `createAuthClient` from `better-auth/react`, `baseURL`
  must be an absolute URL (`${window.location.origin}/api/auth`) — a relative baseURL throws at
  runtime. The dev server proxies `/api` to `apps/api` (`vite.config.ts`), so this stays same-origin
  in dev and cookies just work; in production the web and API origins need to actually match or
  `WEB_ORIGIN`/CORS+cookie config on the API needs to account for the split.
- **`RequireAuth`** (`components/RequireAuth.tsx`) intentionally does **not** use the `useSession()`
  hook for its redirect guard — it does its own imperative `getSession()` fetch on mount. The
  shared session store does not reliably reflect a just-completed sign-up/sign-in by the time a
  freshly-mounted route reads it, which caused a real redirect-to-`/login`-right-after-signup bug;
  the imperative fetch avoids the race. `useSession()` is still fine for read-only UI (e.g. the nav
  bar in `Layout.tsx`).
- **API client** (`lib/apiClient.ts`): thin `fetch` wrapper for the business routes (not auth),
  hits relative `/api/...` paths.

### Database

Drizzle ORM against Postgres, using Bun's native driver (`drizzle-orm/bun-sql`), not
`postgres-js`/`node-postgres`. `apps/api/drizzle.config.ts` points at `src/db/schema.ts` and
outputs migrations to `apps/api/drizzle/`. Local Postgres is `docker-compose.yml` at the repo
root (`wizeai`/`wizeai`/`wizeai`, port 5432) — it is not started automatically by anything.
