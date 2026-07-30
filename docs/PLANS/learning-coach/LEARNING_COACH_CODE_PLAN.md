# Consistent learning coach — code plan

Goal: the WhatsApp assistant should feel like one consistent learning coach, not a chatbot with a
few commands bolted on. A student should be able to phrase things unpredictably ("what's left",
"I'm sick", "how am I doing") and get spot-on behavior, reason-aware planning (calendar load,
buffer days), a real confirm-before-committing flow, and a small set of recognizable, consistently
formatted WhatsApp message "types" instead of ad hoc prose every time.

This is a large effort, broken into ordered phases. **This document details Phase 0 and Phase 1 to
an executable level.** Phases 2 onward are scoped with rationale and flagged decisions, to be
turned into their own code plans when their turn comes.

Three architectural decisions are locked in for the whole effort:

1. **Durable state stays in Drizzle/Postgres, not a second session store.** `assistantService.ts`
   keeps ADK's `InMemorySessionService` for in-conversation short-term context only; anything that
   must survive a restart, a new conversation, or (eventually) multiple API instances gets an
   explicit Drizzle column/table — the pattern the existing `update_study_session` tool already
   established for exactly this reason. (Considered and rejected: swapping in `@google/adk`'s
   `DatabaseSessionService`/MikroORM — it's a smaller lift than expected since MikroORM's Postgres
   driver is already a transitive dependency of `@google/adk`, but it would make MikroORM a second,
   less-visible schema owner inside the same database `db/schema.ts` is meant to fully own.)
2. **Proactive nudges (reminders, daily/weekly check-ins) are out of scope for now.** No
   cron/job-runner infrastructure exists anywhere in this codebase today (confirmed by grep — no
   node-cron, setInterval-based recurring jobs, BullMQ, agenda, nothing in `apps/api/package.json`).
   Listed in the roadmap (Phase 7) with its tradeoffs flagged, not designed until the conversational
   core is built and the deployment topology (single instance vs. scaled) is settled.
3. **Canvas grades are in scope for Phase 1.** Confirmed against Canvas's own REST API docs: no new
   token scope is needed since this app already uses per-student personal access tokens (PATs),
   which carry the full permission set of the user's Canvas account — scopes are an OAuth2
   developer-key concept that doesn't apply to PATs.

## Phase roadmap

| #     | Phase                                                                                                                   | Depends on | Why this order                                                                                                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | WhatsApp message templates + confirmation soft-gate                                                                     | —          | Every later "message type" needs one rendering convention; build it before adding more tools rather than retrofitting. Zero schema changes.                                                                                      |
| **1** | Conversational breadth: assignment detail, study status, grades, bulk reschedule ("I'm sick"), richer planner reasoning | 0          | Cheapest way to make behavior feel "spot on" for unpredictable phrasing — pure extension of the existing tool-calling + per-tool-instruction pattern.                                                                            |
| **2** | Hardened plan-confirmation flow (durable "proposed" state) + fix `reschedule` orphaning old calendar events             | 0, 1       | Turns the Phase 0 soft instruction gate into a real state machine backed by Postgres (decision #1), and fixes a real bug: `schedulerService.reschedule` never cleans up previously-created Google events.                        |
| **3** | Session lifecycle: today's session, done/skipped/need-more-time                                                         | 2          | Needs new `tasks` columns (`actualMinutes`, `completedAt`, `sequence`, `notes`) and should only apply to sessions the student actually confirmed.                                                                                |
| **4** | Durable student preferences (quiet hours, days off, session length, timezone)                                           | 1–3        | Best elicited once the conversational surface is already generating the raw material ("shorter sessions", "never Fridays") to durably capture; also replaces Phase 0's `DEFAULT_TIMEZONE` stopgap with a real per-student value. |
| **5** | Calendar drift detection + real reschedule                                                                              | 3, 4       | Reuses the currently-dead `calendar_events` table (confirmed unused anywhere in the codebase today) as the "last known state" snapshot; benefits from Phase 3's status vocabulary.                                               |
| **6** | Progress reports / insights ("how am I doing", weekly report)                                                           | 3, 5       | Needs completion/skip/actual-time data to be meaningful.                                                                                                                                                                         |
| **7** | Proactive nudges (reminders, check-ins)                                                                                 | 0, 3, 4    | Deferred per decision #2 — needs new cron/job infra design + a userId→phone reverse lookup (trivial: `whatsappConnections` already has `.unique()` on both columns; `phoneNumber.ts` only has phone→userId today).               |

## Phase 0 — Message templates + confirmation soft-gate

### 1. `apps/api/src/whatsapp/messageTemplates.ts` (new)

One formatter per recognizable message "type," returning a plain string composed _before_
`chunkForWhatsapp` (`apps/api/src/whatsapp/messageFormat.ts`). Uses a bare `•` glyph for list
items — not `"- "` — so it never collides with `agent.ts`'s existing hard ban on markdown bullet
syntax, and stays within the existing "_bold_/_italic_, no headers, no tables" constraint:

```ts
export function formatAssignmentList(
  assignments: { title: string; pointsPossible: number | null; deadline: Date }[],
): string;
export function formatPlanProposal(
  assignmentTitle: string,
  tasks: { title: string; description: string; estimatedMinutes: number }[],
): string;
export function formatScheduleConfirmation(
  scheduled: { title: string; start: Date; end: Date }[],
  unscheduledCount: number,
): string;
export function formatCancelConfirmation(count: number): string;
export function formatUpdateConfirmation(title: string, changedFields: string[]): string;
export function formatError(message: string): string;
```

Example (`formatPlanProposal`):

```
🗓️ *Proposed plan — "Essay Draft"*

1. *Outline & thesis* (30 min) — draft a thesis + 3-point outline.
2. *Draft body paragraphs* (60 min) — write paragraphs 1–2.
3. *Finish & revise* (45 min) — complete the draft, one revision pass.

Want me to schedule these? Reply yes to confirm, or tell me what to change.
```

`formatScheduleConfirmation` must surface the `unscheduled` count — today
`schedulerService.createSchedule`'s `ScheduleResult.unscheduled` (tasks that didn't fit in the
window) is computed but never mentioned to the student. Close that gap here.

### 2. `apps/api/src/config/env.ts`

Add `DEFAULT_TIMEZONE` to `EnvSchema` (stopgap only — real per-student timezone lands in Phase 4)
so templates have something to format dates against.

### 3. `apps/api/src/assistant/tools.ts`

Every tool that produces a "message type" gets a `display: string` field alongside its existing
return shape: `getOpenAssignmentsTool`, `breakdownAssignmentTool`, `rescheduleTasksTool`,
`cancelTasksTool`, `updateStudySessionTool`. Every `{ error }` return becomes
`{ error, display: formatError(error) }`.

### 4. `apps/api/src/assistant/agent.ts`

Add to `INSTRUCTION`:

```
Several tools below return a "display" field — a fully pre-formatted, WhatsApp-ready message for
that exact situation. When a tool result has a "display" field, your ENTIRE reply must be exactly
that string, verbatim — no preamble, no summary, nothing before or after it. Only write your own
free-form 2-4 sentence reply when a tool's result has no "display" field, or you're answering
without a tool call at all (explaining earlier reasoning, answering a question about an
assignment's content, etc).

breakdown_assignment proposes a plan; reschedule_tasks commits it to the real calendar. Never call
both in the same turn — call breakdown_assignment, send its display verbatim, and wait for the
student's next message (e.g. "yes", or an edit like "make them shorter") before calling
reschedule_tasks.
```

This ships most of the "never silently schedule" requirement immediately, at zero schema cost;
Phase 2 hardens it into a real state machine.

**No DB changes, no new tools, no new dependencies in Phase 0.**

## Phase 1 — Conversational breadth

All new tools follow existing conventions in `apps/api/src/assistant/tools.ts`: Zod params with
`.min(1)` (never `.positive()` — Gemini's function-calling schema validator rejects
`exclusiveMinimum`), errors returned as `{ error, display }` data rather than thrown, `user_id`
read from `toolContext.state`.

### 1. `get_assignment_detail`

```ts
parameters: z.object({ title: z.string().describe("The assignment's title, or close to it.") });
```

Matches by substring against `canvasClient.listAssignments(userId)` (same ambiguous-match pattern
as `update_study_session`). Returns raw `description`/`pointsPossible`/`deadline` — **no `display`
field**, since this is exactly the free-form Q&A case the instruction should still answer in
natural 2-4 sentence prose, not a template.

### 2. `get_study_status`

```ts
parameters: z.object({ scope: z.enum(["today", "week", "all"]).optional() });
```

Reads `tasks` by `userId` (existing `status`/`scheduledStart`/`scheduledEnd` columns, no schema
change), buckets into scheduled/completed/pending/cancelled for the requested window, returns
`display: formatStatusReport(...)` (new template in `messageTemplates.ts`). Covers "what's left",
"what do I have today", "how am I doing on my plan" (distinct from Canvas grades, below).

### 3. `shift_upcoming_sessions`

```ts
parameters: z.object({
  afterDate: z.string().optional(), // ISO 8601, defaults to now
  shiftDays: z.number().int().optional(),
  shiftHours: z.number().int().optional(),
});
```

Queries `tasks` where `userId` + `status = "scheduled"` + `scheduledStart >= cutoff`, applies the
offset to the row (`scheduledStart`/`scheduledEnd`) and to the linked `calendarClient.updateEvent`
call. Covers "I'm sick", "push everything back a day" — bulk edits `update_study_session` (single
session, by title) can't express.

**Known gap, acceptable for a first cut:** does not re-check shifted times against calendar
free/busy, so it can create a double-booking; revisit once Phase 5's drift-detection machinery
(which needs the same free/busy re-check) exists.

Add matching `agent.ts` instruction: when the student wants to restructure an already-scheduled
plan's session length/count ("make the sessions shorter"), don't invent a new tool — call
`cancel_tasks`, then `breakdown_assignment` again with new `sessionCount`/`sessionMinutes`, then
(after confirmation) `reschedule_tasks`.

### 4. `get_grades` — Canvas research completed for this plan

Confirmed via Canvas's own API docs: a single call gets every course's live grade for the logged-in
student, no new token scope required (PATs already carry full account permissions):

```
GET /api/v1/users/self/enrollments?type[]=StudentEnrollment&state[]=active
```

returns `Enrollment[]`, each with `course_id` and a `grades` object:
`{ current_score, current_grade, final_score, final_grade }` (nulls if the course has no grades
posted yet). Course _names_ need the existing `courses?enrollment_state=active` call already made
in `listAssignments` — extend the `CanvasCourse` interface in `realCanvasClient.ts` to also capture
`name` (Canvas already returns it; the current DTO just doesn't destructure it) and join by
`course_id`.

For assignment-level detail (recent/missing/late grades — "what's my grade on X", "show missing
grades"), the same per-course submissions call already has everything needed:

```
GET /api/v1/courses/:course_id/students/submissions
```

(no `student_ids[]` = defaults to the calling user) returns `Submission[]` with `score`, `grade`,
`workflow_state`, `late`, `missing`, `excused`, `graded_at` — reuse the existing per-course loop
pattern from `listAssignments` (`Promise.all(courses.map(...))`).

Design:

- **`CanvasClient` interface** (`apps/api/src/canvas/canvasClient.ts`): add
  `listGrades(userId): Promise<CourseGrade[]>` where
  `CourseGrade = { courseId, courseName, currentScore, currentGrade, finalScore, finalGrade }`.
  Assignment-level submission detail can be a fast-follow inside the same phase using the same
  DTO-mapping pattern as `listAssignments` — not required for the MVP "how am I doing" / "worst
  course" / "average" behaviors, which only need the enrollments call.
- **`realCanvasClient.ts`**: implement `listGrades` using the single `/users/self/enrollments` call
  above, joined with course names from the existing courses call.
- **`mockCanvasClient.ts`**: add a matching fixture implementation (existing pattern).
- **Assistant tool** `get_grades` (no params) in `tools.ts`, `display: formatGrades(...)` (new
  `messageTemplates.ts` export) — covers "how did I do", "grades", "worst/best course", "average".
  No `{ error }` needed beyond the existing "Canvas not connected" relay pattern.

### 5. Richer planner reasoning (existing injection point, not new architecture)

`plannerService.ts`'s `buildPrompt()` is already the documented per-call constraint injection point
(no per-call instruction override exists on the planner `LlmAgent` itself). Extend it:

- `packages/shared/src/schemas/planner.ts` — add to `PlannerGenerateInputSchema.constraints`:
  ```ts
  existingLoadMinutes: z.number().int().nonnegative().optional(),
  bufferDays: z.number().int().nonnegative().optional(),
  ```
- `plannerService.ts`'s `buildPrompt()` — append conditional lines when present, e.g. _"The student
  already has {existingLoadMinutes} minutes of other study sessions scheduled before this deadline
  — avoid overloading further."_ / _"Leave at least {bufferDays} day(s) of buffer before the
  deadline for review."_
- `planner/agent.ts` — one added instruction bullet telling the planner to act on those lines
  (difficulty-aware pacing), not just echo them.
- `tools.ts`'s `breakdownAssignmentTool` — before calling `generatePlan`, query `tasksTable` for the
  student's other `scheduled`/`pending` minutes due before the new assignment's deadline, and
  default `bufferDays: 1` unless the deadline is under 48h out.

### 6. Schema housekeeping bundled into this phase

Add `updatedAt` to the `tasks` table (`apps/api/src/db/schema.ts`) — it's mutated by
`update_study_session`, and now also by `shift_upcoming_sessions`, but has no `updatedAt` today (an
existing inconsistency vs. every other mutated table). Set it explicitly on every write path that
touches a `tasks` row. Mirror the new column in `packages/shared/src/schemas/entities.ts`'s
`TaskSchema`.

**Zero other new tables in Phase 1** — everything reads/writes existing `tasks`/`assignments`
columns plus the one added `updatedAt`.

## Phase 2 — Confirmation flow + reschedule fix (implemented)

Built as designed, with one deliberate deviation from the original sketch: rather than adding a
separate `confirm_plan` tool, `reschedule_tasks` itself became the durable confirm step — it was
already the tool the agent calls on confirmation, so giving it a new data source (the DB) instead
of introducing a same-purpose tool kept the agent's tool surface unchanged.

- `apps/api/src/db/schema.ts` / `packages/shared/src/schemas/entities.ts`: `tasks.status` gained a
  `"proposed"` value, and a new nullable `planBatchId` column groups every task row created by one
  `breakdown_assignment` call. `planBatchId` is how `reschedule_tasks`/`cancel_tasks` find "the
  current plan" from Postgres alone — durable across restarts and new conversations, with no
  ephemeral session-state pointer involved at all anymore.
- `breakdown_assignment` (`apps/api/src/assistant/tools.ts`): now requires `user_id` (previously
  optional), supersedes any earlier not-yet-confirmed proposal (marks old `"proposed"` rows
  `"cancelled"` — a student can only be negotiating one plan at a time), and inserts the new tasks
  immediately as `"proposed"` with a fresh `planBatchId`, instead of holding them only in ADK
  session state.
- `reschedule_tasks`: reads the most recent `"proposed"` batch straight from `tasks` (ordered by
  `createdAt`) rather than ephemeral state, so confirming works even after a restart or in a brand
  new conversation — the same durability property `update_study_session` already had.
- `cancel_tasks`: finds the student's most recent active batch (`"proposed"` or `"scheduled"`, by
  `planBatchId`) from the DB, deletes calendar events for any already-scheduled rows in it, and
  marks the whole batch `"cancelled"` — also now durable across conversations, matching the same
  "latest plan only" semantics the old ephemeral `current_schedule` state had.
- `get_study_status` / `formatStatusReport`: added an "awaiting your confirmation" bucket so
  proposed-but-unconfirmed tasks aren't invisible in status reports.
- `schedulerService.createSchedule` (`apps/api/src/scheduler/schedulerService.ts`): fixed the
  orphaning bug — before creating a calendar event for a task, it now checks whether that task id
  already has a `googleEventId` (i.e. it's being rescheduled) and calls `calendarClient.updateEvent`
  in place instead of `createEvent`, so calling scheduling logic twice on the same tasks no longer
  leaves a duplicate, orphaned event on the student's real calendar. Since `reschedule()` is just an
  alias for `createSchedule`, this fixes both call paths with one change.

## Phases 3–7 (scoped, not detailed yet)

- **Phase 3 — Session lifecycle.** New `tasks` columns: `actualMinutes`, `completedAt`, `sequence`,
  `notes`; new status values `active`/`missed`. Tools: `get_next_session`, `complete_session`,
  `skip_session`.
- **Phase 4 — Durable preferences.** New table `user_preferences` (1:1 with `users`, following the
  `canvasConnections`/`whatsappConnections` `.unique()`-on-`userId` pattern): quiet hours, days off,
  preferred session length, buffer days default, timezone (replacing Phase 0's `DEFAULT_TIMEZONE`
  stopgap). Elicited conversationally ("never Fridays" → tool call that writes the row), applied by
  `plannerService.buildPrompt()` and `schedulerService.createSchedule` as defaults.
- **Phase 5 — Calendar drift detection.** Put the currently-unused `calendarEvents` table to work as
  a last-known-state snapshot; poll `calendarClient.getEvents` (already the exact call needed — no
  new Calendar API surface), diff against it, reconcile `tasks` rows, notify the student of changes
  made outside the app.
- **Phase 6 — Progress reports/insights.** Weekly/overall reports over Phase 3's completion data;
  new `formatWeeklyReport`/`formatProgressReport` templates.
- **Phase 7 — Proactive nudges.** Deferred per decision #2. When picked up: needs a
  `findPhoneNumberByUserId` addition to `apps/api/src/whatsapp/phoneNumber.ts` (trivial — schema
  already supports it) plus a genuinely new cron/job-runner decision (in-process scheduler vs.
  external trigger vs. queue) gated on the app's actual deployment topology at that time.

## Deliberately out of scope (this document)

Everything in Phases 2–7 beyond the one-paragraph scope above; proactive/scheduled messaging of any
kind; per-student timezone (Phase 0 uses a single `DEFAULT_TIMEZONE` env var stopgap); Canvas
assignment-level grade detail beyond the MVP per-course `get_grades` tool (noted as a fast-follow).

## Verification

- `bun run --cwd apps/api typecheck` after each phase (Zod/Drizzle/shared-type changes surface
  immediately here).
- `bun run --cwd apps/api db:generate` + `db:migrate` for the Phase 1 `tasks.updatedAt` column.
- Manual WhatsApp test per phase (per root `CLAUDE.md`: run `bun run --cwd apps/api start`, no
  `--watch`, to avoid wiping in-memory ADK session mid-conversation) — exercise the golden path AND
  unpredictable phrasing for each new tool (e.g. for Phase 1: "what's left", "what do I have this
  week", "how'd I do in Bio", "I'm sick, push things back a day", plus a plain assignment detail
  question that should stay natural prose, not a template).
- Confirm `display`-field verbatim relay actually holds under real model calls (Gemini can
  paraphrase instead of echoing exactly) — treat this as a real risk to watch in early Phase 0
  testing, not a given.
