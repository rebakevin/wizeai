# Google Calendar real-scheduling milestone — code plan

Goal: a student can ask about a specific Canvas assignment by title, have the agent break it into
study sessions (respecting a count/duration the student gives, or deciding on its own if not), and
have those sessions actually land on the student's Google Calendar — plus cancel a plan and have
the real events removed. Google Calendar is currently `MockCalendarClient` — in-memory fixture
events, manual "paste a token" connect form, nothing real.

Two of the three needed tools already exist in `apps/api/src/assistant/tools.ts` but are dormant
behind `ENABLE_TOOLS = false` in `agent.ts`: `breakdownAssignmentTool` and `rescheduleTasksTool`
(plus `cancelTasksTool`). This turns all three on for real, backed by a real calendar, rather than
building new tools — "read an assignment by title" doesn't need a new tool either, since
`get_open_assignments` already returns titles the model can match against in conversation. The only
genuinely new pieces are: a real `CalendarClient`, a small extension to `breakdown_assignment`'s
params (optional session count / session length), and the account-linking flow itself.

**Key design choice**: instead of hand-rolling Google OAuth2 (token exchange, refresh, storage),
this uses Better Auth's existing account-linking support — Better Auth is already configured here
for Google sign-in and already has an `accounts` table with `accessToken`/`refreshToken`/`scope`
columns (`apps/api/src/db/schema.ts`). Confirmed against Better Auth v1.6.23 (the installed
version):
- `authClient.linkSocial({ provider: "google", scopes: [...], callbackURL })` — client-side, lets
  an already-logged-in user grant additional Google scopes (Calendar, here) via a normal OAuth
  redirect. Handled entirely by Better Auth's existing `/api/auth/*` routes — no new backend
  endpoints needed for connecting.
- `authClient.unlinkAccount({ providerId: "google" })` — client-side disconnect, same deal.
- `auth.api.getAccessToken({ body: { providerId: "google", userId } })` — server-side, returns a
  valid access token and **automatically refreshes it** if expired. This is what the real Calendar
  client calls before each Google Calendar API request — no manual refresh-token logic to write.

This means the bespoke `googleConnections` table, its manual "paste a token" form, and the
`/calendar/connect` + `/calendar/disconnect` routes all become dead weight and get removed — the
`accounts` table Better Auth already manages replaces them.

## Changes

### 1. `apps/api/src/auth/auth.ts`

Add `account: { accountLinking: { enabled: true } }` to the `betterAuth(...)` config — explicit
rather than relying on an assumed default, since `linkSocial` depends on it.

### 2. Drop `googleConnections`, shrink `CalendarClient`

- `apps/api/src/db/schema.ts`: remove the `googleConnections` table entirely (superseded by Better
  Auth's `accounts` table). `bun run --cwd apps/api db:generate && db:migrate` for the drop.
- `apps/api/src/calendar/calendarClient.ts`: `CalendarClient` shrinks to just the calendar-data
  operations — `getEvents`, `createEvent`, `updateEvent`, `deleteEvent`. Drop `connect`/
  `disconnect`/`isConnected` from the interface (connecting is now a Better Auth concern, not a
  calendar-client concern). Add `description?: string` to `CalendarEventInput` so scheduled events
  can reference the assignment they're for.
- New `apps/api/src/calendar/googleAccountStatus.ts`: `isCalendarConnected(userId): Promise<boolean>`
  — queries the `accounts` Drizzle table directly (`providerId = "google"`, `userId` match, `scope`
  contains the calendar scope string). Backs the status badge, same pattern as the Canvas/WhatsApp
  `isConnected` checks already built.
- `apps/api/src/calendar/mockCalendarClient.ts`: simplify to match the shrunk interface (drop the
  `googleConnections` reads/writes; keep the in-memory fixture-event behavior for reference, though
  nothing will import it anymore).

### 3. `apps/api/src/calendar/realCalendarClient.ts` (new)

Implements the shrunk `CalendarClient` against Google Calendar API v3
(`https://www.googleapis.com/calendar/v3/calendars/primary/events...`). Before each call, gets a
bearer token via `auth.api.getAccessToken({ body: { providerId: "google", userId } })`.
- `getEvents(userId, rangeStart, rangeEnd)` — `GET .../events?timeMin&timeMax&singleEvents=true&orderBy=startTime`,
  mapped to `CalendarEventRecord[]` (id → `googleEventId`, summary → `title`, start/end.dateTime →
  `start`/`end`). Feeds straight into the existing `subtractBusyBlocks` logic in
  `schedulerService.ts` — that logic doesn't change.
- `createEvent(userId, event)` — `POST .../events` with `summary`, `description`, `start.dateTime`/
  `end.dateTime` (ISO, `timeZone: "UTC"` — no per-user timezone modeling in this app yet; Google
  Calendar still displays the event correctly converted to the viewer's own timezone since the
  absolute instant is what's stored).
- `updateEvent`/`deleteEvent` — `PATCH`/`DELETE .../events/{id}`.

### 4. Point consumers at the real client

`apps/api/src/scheduler/schedulerService.ts` currently hardcodes
`import { calendarClient } from "../calendar/mockCalendarClient"` — change to `./realCalendarClient`.
Same swap in `apps/api/src/calendar/routes.ts`'s `/sync` route.

### 5. `apps/api/src/calendar/routes.ts` — shrink to just status

Remove `POST /connect` and `POST /disconnect` (and `CalendarConnectSchema`) — connecting/
disconnecting now happens client-side via Better Auth directly, nothing for our backend to do.
Replace the old DB-backed `GET /status` with one calling `isCalendarConnected(session.user.id)`
from the new helper. Keep `POST /sync` (dev-only, unchanged shape, now against the real client).

### 6. Track `googleEventId` through scheduling, so cancel can undo it for real

- `packages/shared/src/schemas/scheduler.ts`: add `googleEventId: z.string()` to
  `ScheduledTaskSchema`.
- `apps/api/src/scheduler/schedulerService.ts`: `createSchedule` already gets the created record
  back from `calendarClient.createEvent(...)` — just include `googleEventId` in the pushed
  `scheduled` entry (one-line change, the data's already there).

### 7. `breakdown_assignment` — optional session count / duration constraints

- `packages/shared/src/schemas/planner.ts`: add an optional `constraints` object to
  `PlannerGenerateInputSchema` — `{ taskCount?: number, minutesPerTask?: number }` (both optional,
  independently settable — "5 sessions", "45 minutes each", both, or neither).
- `apps/api/src/planner/plannerService.ts`'s `buildPrompt()` appends constraint lines when present
  (e.g. "Produce exactly 5 tasks." / "Each task should be about 45 minutes."). The planner's system
  `instruction` (`planner/agent.ts`) doesn't need to change — it's the per-call user prompt that
  varies; when neither constraint is given, behavior is identical to today (freeform, "prefer 3-6
  tasks"). No enforcement beyond the prompt — treat exact compliance as best-effort, matching the
  planner's existing freeform posture; no retry/validation machinery exists here to bolt on.
- `apps/api/src/assistant/tools.ts`'s `breakdownAssignmentTool`: add optional Zod params
  `sessionCount`/`sessionMinutes`, passed through as `constraints.taskCount`/`constraints.minutesPerTask`.

### 8. `cancel_tasks` actually deletes the real events

`apps/api/src/assistant/tools.ts`'s `cancelTasksTool`: read `current_schedule` from state (already
set by `reschedule_tasks`) and `user_id`; for each `scheduled` entry, call
`calendarClient.deleteEvent(userId, googleEventId)` before clearing state.

### 9. Turn the tools on

`apps/api/src/assistant/agent.ts`: remove the `ENABLE_TOOLS` gate entirely (all four tools —
`get_open_assignments`, `breakdown_assignment`, `reschedule_tasks`, `cancel_tasks` — become
always-on) and fold `TOOL_INSTRUCTION` into the base instruction unconditionally. Update the
instruction text:
- Remove the "I don't have calendar access yet" disclaimer — it's real now.
- Document `breakdown_assignment`'s new optional `sessionCount`/`sessionMinutes` params: pass them
  when the student specifies either; omit and let the tool decide otherwise.
- Add guidance for matching an assignment the student describes by title against the most recent
  `get_open_assignments` result (call it first if not already called this turn); ask a clarifying
  question rather than guessing if the match is ambiguous.
- Note that `reschedule_tasks` now creates real Google Calendar events and `cancel_tasks` really
  deletes them — the model should talk about these as real actions taken, not caveat them.

### 10. Frontend — `apps/web/src/routes/ConnectCalendar.tsx`

Replace the manual access-token form entirely:
- **Connected** (via the existing `useConnectionStatus("calendar")` hook, unchanged): green check
  "Google Calendar connected" + a **Disconnect** button calling
  `authClient.unlinkAccount({ providerId: "google" })` directly — no `apiClient.ts` round trip —
  then invalidates the `connectionStatusKey("calendar")` query on success, same pattern already
  used for Canvas/WhatsApp.
- **Not connected**: a single **Connect with Google Calendar** button calling
  `authClient.linkSocial({ provider: "google", scopes: ["https://www.googleapis.com/auth/calendar.events"], callbackURL: "/connect/calendar" })`
  — redirects the whole page to Google's consent screen and back, so no form/loading state beyond
  disabling the button while the redirect kicks off.
- Keep the existing `BackLink` at the top (already built for the other two Connect screens).

`apps/web/src/lib/apiClient.ts`: remove `connectCalendar`/`disconnectCalendar` (superseded); keep
`getCalendarStatus` (still backed by the real `/calendar/status` route). No changes needed to
`Account.tsx` or `lib/connections.ts` — both are already generic across all three services.

## Deliberately out of scope

Persisting assignments/tasks/schedules to Postgres (`assignments`/`tasks`/`calendarEvents` tables
stay unused — everything still lives in the ADK session's in-memory state, same as today, so a
server restart still loses an in-progress plan even though the calendar events it already created
remain real and orphaned — pre-existing limitation, not introduced here). Per-user timezone
modeling. Encrypting OAuth tokens at rest (Better Auth supports `account.encryptOAuthTokens: true`;
worth turning on later, not required for this to work). Handling the "sensitive scope" Google
verification review needed to go to production — fine for testing with explicitly-added test users.

## Verification

1. `docker compose up -d`, `bun run --cwd apps/api db:generate && db:migrate` (drops
   `googleConnections`, adds nothing new — confirm the generated SQL is just the `DROP TABLE`).
2. `bun run --cwd apps/api start` (no `--watch`, keeps the ADK session alive) + `bun run dev:web`.
3. Log into the web app, go to Connect Google Calendar, click **Connect with Google Calendar**,
   complete the consent screen with a test-user Google account, confirm you land back on
   `/connect/calendar` showing the green "connected" state.
4. Over WhatsApp (or `POST /api/agent/chat`) with that same linked account: ask what assignments
   are open, then ask to schedule study sessions for one of them by title — with no session-count
   given ("break down and schedule my Essay assignment") and separately with one given ("break the
   Problem Set into 5 sessions of 45 minutes and schedule them") — confirm real events appear on
   the connected Google Calendar in both cases, with roughly the right count/duration in the second
   case.
5. Ask to cancel the plan — confirm the events actually disappear from Google Calendar, not just
   from the chat's memory.
6. Disconnect from the web app, confirm the status flips back and a subsequent schedule request
   fails gracefully (clear error relayed to the student) rather than hanging or crashing.
7. `bun run --cwd apps/api typecheck`, `bun run lint`, `bun run --cwd apps/web build`.
