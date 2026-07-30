# Canvas real-assignments milestone — code plan

Goal: a student asks the WhatsApp agent for their open assignments and gets back a bullet list of
`title`, `marks` (points possible), and `due date`, pulled live from Canvas via Instructure's REST
API. Canvas is currently `MockCanvasClient` — hardcoded fixtures, ignores `userId` entirely.

This surfaces a gap that has to close first: **nothing today maps a WhatsApp phone number to a
specific student.** Every mock `/connect` route (`canvas`, `whatsapp`, `calendar`) silently
defaults to one seeded `DEMO_USER_ID`, and the WhatsApp webhook uses the raw inbound phone number
(`message.from`) directly as the identity passed into `assistantService.chat()` — no lookup at
all. `apps/web` is already gated behind a real Better Auth session (`RequireAuth`) and is where a
student is meant to submit both their WhatsApp number and Canvas credentials, so that's the
account-linking mechanism this depends on.

## Changes

### 1. `apps/api/src/canvas/routes.ts`, `apps/api/src/whatsapp/routes.ts` — real sessions, not `DEMO_USER_ID`

`POST /connect` on both routers currently trusts a client-supplied `userId` (never actually sent)
that defaults to `DEMO_USER_ID` (`CanvasConnectSchema`, `WhatsappConnectSchema`). Resolve the real
user the same way `apps/api/src/auth/routes.ts:10-13` already does —
`auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` — and 401 if there's no session.
Drop `userId` from both body schemas.

### 2. `apps/api/src/db/schema.ts` — uniqueness + a migration

Add `.unique()` on `canvasConnections.userId`, and on `whatsappConnections.userId` and
`whatsappConnections.phoneNumber`. Today none of these are unique, so reconnecting (or two
students entering the same number) creates ambiguous duplicate rows — harmless for the mock (which
never reads the DB to answer `listAssignments`), not harmless once the real Canvas client actually
needs the one true row per user. Run `bun run --cwd apps/api db:generate` then `db:migrate` after
editing the schema.

### 3. Phone number normalization (new small helper, used in two places)

Research turned up a real mismatch: the WhatsApp connect form's placeholder implies a
`+`-prefixed number (`+15551234567`), while Meta's inbound `message.from` (`wa_id`) arrives as
digits-only, no `+`. Add a `normalizePhoneNumber(raw): string` helper (strip everything but
digits) in the whatsapp module. Use it both when storing `phoneNumber` on connect and when looking
up the inbound sender, so the two representations actually match.

### 4. `apps/api/src/whatsapp/*` — look up the student, upsert connections

- Add `findUserIdByPhoneNumber(phoneNumber)` querying `whatsappConnections` by the normalized
  number.
- In `realWhatsappClient.ts`, before the existing `chat(message.from, body)` call: normalize
  `message.from`, look up the user. If found, call `chat(userId, body)` instead (switches ADK
  session identity from raw phone digits to the account id). If not found, reply with a fixed
  "connect your number in the Wize AI app first" message and skip the agent call entirely.
- `connect()` on both the WhatsApp and Canvas clients moves from a bare insert to
  `onConflictDoUpdate` (upsert) on `userId`, now that it's a unique column.

### 5. `apps/api/src/canvas/canvasClient.ts` — extend the DTO

Add `pointsPossible: number | null` to `CanvasAssignment` — the "marks" the tool needs to show,
not on the interface today.

### 6. `apps/api/src/canvas/realCanvasClient.ts` (new)

Implements `CanvasClient` against Instructure's REST API (`Authorization: Bearer <token>` against
the student's stored `canvasBaseUrl`):

- `connect(userId, canvasBaseUrl, apiToken)` — calls `GET /api/v1/users/self` first to validate
  the token/URL before saving anything; returns a clear error on failure instead of silently
  storing bad credentials (today's mock does zero validation). Then upserts the connection row.
- `disconnect(userId)` — deletes the row.
- `listAssignments(userId)` — looks up the connection row (error if none); calls
  `GET /api/v1/courses?enrollment_state=active&per_page=100`; for each course, in parallel, calls
  `GET /api/v1/courses/{id}/assignments?bucket=upcoming&per_page=100` (`bucket=upcoming` is
  Canvas's own "due in the future, not yet closed" filter — this is what makes them "open"); maps
  each Assignment's `name` → `title`, `due_at` → `deadline`, `points_possible` → `pointsPossible`.
- `getAssignment(userId, canvasId)` — searches the `listAssignments` result, matching the mock's
  existing behavior; not on the critical path for this tool.

Point consumers at it: change the `canvasClient` import in `routes.ts` (and the new tool below)
from `./mockCanvasClient` to `./realCanvasClient`. Leave `mockCanvasClient.ts` in place, unused.

### 7. `apps/api/src/assistant/tools.ts` — `get_open_assignments`

New `FunctionTool`, same shape as `breakdownAssignmentTool`: no parameters. `execute(_input,
toolContext)` reads `toolContext?.state.get<string>("user_id")` (already seeded by
`assistantService.chat`, same pattern `rescheduleTasksTool` uses), calls
`canvasClient.listAssignments(userId)`, returns `{ assignments: [{ title, pointsPossible,
deadline }] }` — plain JSON; the model formats the bullet list.

### 8. `apps/api/src/assistant/agent.ts`

This tool is read-only — no state mutation, no scheduling side effect — so include it in `tools`
**unconditionally**, separate from the `ENABLE_TOOLS`-gated trio (`breakdown_assignment`,
`reschedule_tasks`, `cancel_tasks`), which stays gated per the existing chat-only milestone
comment. Add a short always-on instruction snippet: when to call `get_open_assignments`, and to
present results as bullet points showing only title, marks, and due date — nothing else.

## Deliberately out of scope

Course-listing as its own tool (courses are just the intermediate step to reach assignments here),
OAuth2 against Canvas (personal access token is enough for now), encrypting the stored Canvas
token (still plaintext, same as today's `accessToken` column), retry/backoff on Canvas API calls,
a `/whatsapp/disconnect` HTTP route (the client method exists, just isn't exposed yet — unrelated
to this milestone).

## Verification

1. `docker compose up -d`, then `bun run --cwd apps/api db:generate && db:migrate`.
2. `bun run --cwd apps/api start` (no `--watch`, keeps the in-memory ADK session alive) + ngrok
   tunnel; `bun run dev:web` separately.
3. Sign up / log in on the web app, connect Canvas with a real base URL + personal access token —
   confirm a bad token now surfaces an error instead of silently "succeeding." Connect WhatsApp
   with a real number.
4. From that number: ask for open assignments, confirm a bullet list of title/marks/due date
   matching what's actually due in Canvas.
5. Message from a different, unconnected number — confirm the "connect your account first" reply,
   not a crash or someone else's data.
6. `bun run --cwd apps/api typecheck` and `bun run lint` clean.
