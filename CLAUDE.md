# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Wize AI's MVP: one job — never let a student miss an assignment deadline. It reads Canvas
assignments, breaks them into study tasks with an AI planner, schedules them on Google Calendar,
and lets the student talk to it over WhatsApp. **Canvas, Google Calendar, and WhatsApp are all real
integrations** — nothing left mocked. Canvas talks to Instructure's REST API using a per-student
personal access token; Google Calendar uses Better Auth's account-linking (not a hand-rolled
OAuth2 flow — see the Calendar bullet below); WhatsApp uses Meta's Cloud API and is currently the
only way an end user is meant to talk to the agent. The web app (`apps/web`, behind a real Better
Auth session via `RequireAuth`) is where a student connects all three — Connect Canvas validates +
stores their base URL and token, Connect Calendar links their Google account with calendar scope,
Connect WhatsApp stores their phone number — and that account link is what the WhatsApp webhook
uses to resolve an inbound sender to a specific student before calling the agent; a message from an
unlinked number gets a "connect your account first" reply instead of a generic session. There is no
dashboard; the web app only covers auth + connecting integrations.

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

There is no broad test suite — the one exception is `apps/api/src/whatsapp/messageFormat.test.ts`
(`bun test`), covering the WhatsApp message-chunking edge cases. Type-checking is per-app
(`tsc -b` for apps/web's project references, `tsc --noEmit -p tsconfig.json` for apps/api and
packages/shared) — there's no single root-level typecheck command.

Postgres and both dev servers do **not** survive a machine/Docker restart — if `bun run dev:api`
fails with a Postgres connection error, run `docker compose up -d` first.

### Environment

Copy `apps/api/.env.example` to `apps/api/.env`. Required: `DATABASE_URL` (matches
`docker-compose.yml`'s `wizeai`/`wizeai`/`wizeai` creds on `localhost:5432`), `GEMINI_API_KEY`,
`BETTER_AUTH_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_VERIFY_TOKEN` (server won't boot without these — see the WhatsApp section below for
where they come from). Optional: `WEB_ORIGIN` (defaults to `http://localhost:5173`, used for CORS
+ Better Auth trusted origins), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (originally just Google
sign-in — social provider is only registered if `GOOGLE_CLIENT_ID` is set — but now load-bearing
for Google Calendar too, since Calendar connects via the same Google OAuth client with an
additional scope; unset, the server still boots fine, but Connect Calendar's `linkSocial` call
fails cleanly since Better Auth won't have "google" registered), `WHATSAPP_APP_SECRET` (enables
webhook signature verification when set — skipped with a warning if empty), `WHATSAPP_API_VERSION`
(defaults `v23.0` — needs v23+ for the typing-indicator call), `PORT` (defaults 3001).

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
  `/api/auth/reference`. **The hand-written `verifications` table must have every column Better
  Auth's adapter expects, not just what email/password auth happens to touch** — it was missing
  `updatedAt` (used to write OAuth state during `linkSocial`/account-linking, not exercised by
  plain sign-up/sign-in) and every `linkSocial` call 500'd with `BetterAuthError: The field
  "updatedAt" does not exist in the "verifications" Drizzle schema` until it was added. If a new
  Better Auth flow (another plugin, another OAuth provider, admin/organization features, etc.)
  starts erroring the same way, it's almost certainly a missing column on `users`/`sessions`/
  `accounts`/`verifications` in `db/schema.ts`, not a real bug — check `better-auth`'s own default
  schema for that table (`bunx @better-auth/cli generate` output, or the docs) against ours.
- **Canvas** (`canvas/`): real integration against Instructure's REST API, `realCanvasClient.ts`
  (`Authorization: Bearer <token>` against the student's stored `canvasBaseUrl`). `POST
  /canvas/connect` (and `POST /whatsapp/connect`) resolve the real logged-in user via
  `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` — same pattern as
  `auth/routes.ts`'s `/me` — and 401 without a session; `userId` is no longer accepted in the
  request body. `connect()` validates the base URL/token with `GET /api/v1/users/self` *before*
  saving anything (a bad token surfaces as a 400 immediately, not as a silent later failure), then
  upserts (`onConflictDoUpdate` on `userId`, which is now `.unique()` on both `canvasConnections`
  and `whatsappConnections`). `listAssignments()` calls `GET /api/v1/courses?enrollment_state=active`
  then, per course, `GET /api/v1/courses/{id}/assignments?bucket=upcoming` — Canvas's own
  "due in the future, not yet closed" filter is what defines "open." `mockCanvasClient.ts` still
  exists but nothing imports it anymore.
- **Calendar** (`calendar/`): real integration, but deliberately *not* a hand-rolled OAuth2 flow —
  it reuses Better Auth's own account-linking. The web app calls `authClient.linkSocial({
  provider: "google", scopes: ["https://www.googleapis.com/auth/calendar.events"], callbackURL })`
  directly (no backend route of ours involved; Better Auth's existing `/api/auth/*` handler owns
  the whole redirect/token-exchange flow) and `authClient.unlinkAccount({ providerId: "google" })`
  to disconnect — both client-side, straight from `ConnectCalendar.tsx`. This requires
  `account: { accountLinking: { enabled: true } }` in `auth/auth.ts`. Server-side,
  `realCalendarClient.ts` calls `auth.api.getAccessToken({ body: { providerId: "google", userId }
  })` before every Google Calendar API request (`https://www.googleapis.com/calendar/v3/calendars/primary/events`)
  — this **automatically refreshes** an expired token using the refresh token Better Auth already
  stored, so there's no manual refresh logic anywhere in this codebase. Tokens live in Better
  Auth's own `accounts` table (`accessToken`/`refreshToken`/`scope` columns) — there is no
  `googleConnections` table anymore (dropped; it's what `mockCalendarClient.ts` used to write to).
  `GET /calendar/status` checks connection by querying `accounts` directly for a `providerId:
  "google"` row whose `scope` contains the calendar scope (`googleAccountStatus.ts` —
  `isCalendarConnected()`) — plain row-existence isn't enough since a user could have a Google
  account linked for sign-in only, without ever having granted calendar access. `CalendarClient`
  (the interface `mockCalendarClient.ts`/`realCalendarClient.ts` both implement) only has
  `getEvents`/`createEvent`/`updateEvent`/`deleteEvent` — no `connect`/`disconnect`/`isConnected`,
  since connecting is entirely a Better Auth concern now, not a calendar-client one.
- **WhatsApp** (`whatsapp/`): real integration via Meta's Cloud API.
  `graphClient.ts.sendText()` POSTs to `graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages`;
  `sendReadReceiptAndTyping()` marks the inbound message read and shows the typing indicator in
  one call (auto-dismisses after 25s or when the reply sends). `realWhatsappClient.receiveWebhook()`
  parses Meta's `entry[].changes[].value.messages[]`/`.statuses[]` shape (both all-optional —
  a parse failure must never mean silence) and logs an unconditional `[whatsapp] inbound: N
  message(s), M status(es)` line so a missing reply is diagnosable as "never arrived" vs. "arrived
  but failed downstream." Each message is deduped by `id` (`inboundQueue.ts`'s bounded `markSeen`
  set, checked synchronously before any `await` — Meta redelivers on retry) and dropped if its
  `timestamp` is more than 5 minutes old (handles retry bursts after an ngrok reconnect).
  Non-text messages (voice notes, images, etc.) get a "text only" reply instead of being silently
  dropped. Text messages are handed to `inboundQueue.ts`'s `enqueue(from, ...)`, which chains
  promises per sender so two fast messages from the same student can't race the same ADK session,
  while different senders still run in parallel. Inside the queued job: `sendReadReceiptAndTyping`
  fires without being awaited (courtesy, not a dependency), then `chat()` and the chunked send are
  wrapped in **separate** try/catch blocks — a `chat()` failure gets a user-facing fallback reply
  ("something went wrong, mind sending that again?") instead of silence, and a send failure is
  distinguishable in logs from a chat failure. Replies over WhatsApp's 4096-char limit are split
  by `messageFormat.ts`'s `chunkForWhatsapp()` (paragraph → line → sentence → space → hard-cut
  boundary, sent sequentially so ordering is preserved) — sending over-length text otherwise gets
  a Graph 400 and the student gets nothing. Before calling the agent, the inbound sender (`wa_id`)
  is normalized to digits-only (`phoneNumber.ts`'s `normalizePhoneNumber` — strips the `+` a web
  form might include, since Meta's `wa_id` never has one) and looked up in `whatsappConnections`
  via `findUserIdByPhoneNumber`; the resolved account id, not the raw phone number, is what gets
  passed to `chat()` as both `userId` and ADK session id. An unrecognized number gets a fixed
  "connect your number in the app first" reply and never reaches the agent. `routes.ts`'s
  `POST /webhook`
  **acks 200 immediately** and processes/replies asynchronously (Meta expects a fast response; the
  agent call can take several seconds) and verifies `X-Hub-Signature-256` against
  `WHATSAPP_APP_SECRET` when that env var is set (skipped with a one-time warning otherwise) —
  signature verification needs the raw body, captured via `express.json()`'s `verify` callback in
  `app.ts` (`req.rawBody`). `GET /webhook` is Meta's one-time verification handshake, checked
  against `WHATSAPP_VERIFY_TOKEN`. `POST /send` is a dev-only route for testing outbound sends
  without needing an inbound message first. WhatsApp is not reachable from Meta without a public
  HTTPS tunnel to your local server (e.g. `ngrok http 3001`) — Meta cannot call `localhost`.
  Beyond the tunnel, your app also needs to be **subscribed to the WABA**
  (`POST /{WABA_ID}/subscribed_apps`) — setting the callback URL in the App Dashboard configures
  it at the *app* level but does not itself subscribe the app to any specific WhatsApp Business
  Account; delivery silently no-ops without this even though the dashboard's own "check test
  webhooks" panel (which logs Meta-side events, not confirmed deliveries) can make it look fine.
  **Run the API with `bun run --cwd apps/api start` (no `--watch`) while testing WhatsApp
  conversations** — `dev:api`'s file-watch restarts on every save, which wipes the in-memory ADK
  session (see below) mid-conversation; keep using `dev:api` for everything else.
- **Assistant** (`assistant/`): the general-purpose conversational agent — `POST /api/agent/chat`
  and the WhatsApp flow above both go through `assistantService.chat(userId, message)`. All four
  tools (`tools.ts`) are always-on now — the earlier `ENABLE_TOOLS` chat-only gate is gone:
  - `get_open_assignments` — read-only, calls `canvasClient.listAssignments(userId)`; the
    instruction tells the model to present the result as bullet points of title/marks/due date
    only.
  - `breakdown_assignment` — calls the Planner (below). Takes optional `sessionCount`/
    `sessionMinutes` params; the agent's instruction tells it to match an assignment the student
    names by title against the most recent `get_open_assignments` result (for the real deadline —
    never guess one) and to pass session count/length only if the student actually specified them,
    letting the tool decide freely otherwise. **Zod numeric params here must use `.min(1)`, not
    `.positive()`** — `.positive()` compiles to JSON Schema's `exclusiveMinimum`, which Gemini's
    function-calling schema validator rejects outright (`Unknown name "exclusiveMinimum"`, a 400
    from the Gemini API that silently aborts the whole run with no final response) — this broke
    every tool call the first time `sessionCount`/`sessionMinutes` were added, not just that one
    field, so watch for the same trap in any future tool parameter.
  - `reschedule_tasks` — schedules the current tasks onto the student's real Google Calendar via
    `schedulerService.createSchedule`.
  - `cancel_tasks` — clears the plan *and* deletes the real calendar events already created for it
    (reads `googleEventId` off each entry in the `current_schedule` state and calls
    `calendarClient.deleteEvent`) — cancelling only in the chat's memory while leaving real events
    behind would be misleading now that scheduling is real.

  All four read/write `userId` from `toolContext.state.get("user_id")` the same way. Unlike the
  Planner, this agent has `tools` (built with ADK's `FunctionTool` + Zod `parameters`, not Gemini's
  `Schema`/`Type`) and a **persistent** per-`userId` session
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
  `planner/schema.ts`) forcing structured task-breakdown output. The system `instruction` is a
  fixed string set at module load — there's no per-call instruction override — so
  `plannerService.ts`'s `buildPrompt()` is where per-call constraints get injected instead:
  `PlannerGenerateInput.constraints.taskCount`/`.minutesPerTask` (both optional, independently
  settable — `@wizeai/shared`'s `PlannerGenerateInputSchema`) become extra lines in the user-turn
  prompt ("Produce exactly N tasks." / "Each task's estimatedMinutes should be M.") when present;
  omitted entirely when neither is given, so freeform behavior ("prefer 3-6 tasks") is unchanged.
  No enforcement beyond the prompt — treat compliance as best-effort, there's no retry/validation
  loop here. `plannerService.ts` runs it via `InMemoryRunner.runEphemeral()`, reads the final
  response with `isFinalResponse`/`stringifyContent`, then validates the parsed JSON against the
  shared `TaskBreakdownSchema` before persisting `tasks` rows. If ADK's TS API surface ever seems
  to not match what's here, check `node_modules/@google/adk/dist/types/` directly — the published
  docs are Python-first and the TS surface has diverged in places (see the `GEMINI_API_KEY` note
  above).
- **Scheduler**: `schedulerService.ts` does real free-slot-finding (`subtractBusyBlocks` from
  `@wizeai/shared/utils`) over the real Calendar client's busy blocks (`realCalendarClient.ts`,
  imported directly — not injected), then greedily places tasks into the earliest slot each fits
  and calls `calendarClient.createEvent` to actually create them. Each entry in
  `ScheduleResult.scheduled` carries the created event's `googleEventId` (`@wizeai/shared`'s
  `ScheduledTaskSchema`) specifically so `cancel_tasks` (above) can delete the right events later —
  it's the same object `createEvent` already returns, just threaded through rather than dropped.
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
  `WEB_ORIGIN`/CORS+cookie config on the API needs to account for the split. **Same trap applies to
  any `callbackURL` passed into `authClient` calls** (e.g. `ConnectCalendar.tsx`'s
  `linkSocial({ callbackURL: ... })`) — a relative path doesn't throw, it silently resolves against
  the *API's* own origin (`BETTER_AUTH_URL`, port 3001) since that's where the OAuth callback
  redirect actually executes from, not the browser's page origin — so after finishing Google's
  consent screen you land on a 404 at `localhost:3001/connect/calendar` instead of the React route
  on `localhost:5173`. Always pass `` `${window.location.origin}/connect/calendar` ``, same fix as
  `baseURL` above.
- **`RequireAuth`** (`components/RequireAuth.tsx`) intentionally does **not** use the `useSession()`
  hook for its redirect guard — it does its own imperative `getSession()` fetch on mount. The
  shared session store does not reliably reflect a just-completed sign-up/sign-in by the time a
  freshly-mounted route reads it, which caused a real redirect-to-`/login`-right-after-signup bug;
  the imperative fetch avoids the race. `useSession()` is still fine for read-only UI (e.g. the nav
  bar in `Layout.tsx`).
- **API client** (`lib/apiClient.ts`): thin `fetch` wrapper for the business routes (not auth),
  hits relative `/api/...` paths.
- **Connect screens + status** (`routes/ConnectCanvas.tsx`/`ConnectCalendar.tsx`/
  `ConnectWhatsapp.tsx`, `routes/Account.tsx`): all three share one status pattern —
  `lib/connections.ts`'s `useConnectionStatus(service)` (a thin TanStack Query wrapper, one shared
  `connectionStatusKey(service)` query key per service) backs a green-border/checkmark "connected"
  badge in `Account.tsx` and a full connected-vs-form branch in each Connect page. Each Connect
  page also renders `components/BackLink.tsx` (a plain `<Link to="/account">`) above its content in
  both states. Canvas and WhatsApp connect/disconnect through `apiClient.ts` (`POST
  /canvas|whatsapp/connect|disconnect`, session-gated on the API side); Calendar deliberately
  doesn't — `ConnectCalendar.tsx` calls `authClient.linkSocial(...)`/`authClient.unlinkAccount(...)`
  directly (see the Calendar bullet under apps/api above) since Better Auth already owns that whole
  flow, so there's nothing for `apiClient.ts` to wrap beyond `getCalendarStatus()`. Whichever path,
  a successful connect/disconnect mutation calls
  `queryClient.invalidateQueries({ queryKey: connectionStatusKey(service) })` so the badge flips
  immediately without a manual refetch.

### Database

Drizzle ORM against Postgres, using Bun's native driver (`drizzle-orm/bun-sql`), not
`postgres-js`/`node-postgres`. `apps/api/drizzle.config.ts` points at `src/db/schema.ts` and
outputs migrations to `apps/api/drizzle/`. Local Postgres is `docker-compose.yml` at the repo
root (`wizeai`/`wizeai`/`wizeai`, port 5432) — it is not started automatically by anything.
