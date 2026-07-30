# Canvas (Instructure) — platform setup

Goal: get real Canvas credentials and real test data so the `get_open_assignments` tool
(`CANVAS_CODE_PLAN.md`) has something to fetch. This uses a personal access token (PAT), not
OAuth2 — no Instructure developer account or app registration needed.

## 1. Get a Canvas instance to test against

If you already have access to a real institution's Canvas, you can use that. If not, sign up for a
free Instructure trial/sandbox (a "Canvas Free-for-Teacher" account works) — personal access
tokens behave identically there and don't need institutional admin approval.

Note your Canvas **base URL** once you have an instance — e.g. `https://yourinstitution.instructure.com`.
That's one of the two values you'll paste into the Connect Canvas screen.

## 2. Create test data

Create at least one course with a few assignments that have due dates and point values set, so
there's something real to fetch:

- As a teacher/admin on a free instance: create a course, add 2-3 assignments with future due
  dates and non-zero points possible.
- Or, if you already have a student enrollment in an existing course with open assignments, that
  works too — nothing about the tool requires a teacher role, `GET /api/v1/courses` and
  `.../assignments` work fine as a student reading their own data.

## 3. Generate a Personal Access Token

Log into Canvas → **Account** → **Settings** → scroll to **"Approved Integrations"** →
**"+ New Access Token"** → purpose can be anything (e.g. "Wize AI") → **Generate Token**.

**Copy it immediately** — Canvas only shows the token once. This is the second value you'll paste
into Connect Canvas, alongside the base URL from step 1.

## 4. Nothing else is needed on the Instructure side

Unlike WhatsApp's Meta App Dashboard setup, there's no app registration, no webhook subscription,
no callback URL, and no review process for a personal access token — it's scoped to your own
account and works the moment it's generated. (An OAuth2 Developer Key would need admin approval
from the Canvas instance owner; that's the path we're deliberately not taking for this milestone.)

## 5. Connect it in the Wize AI web app

Once the code changes land (`CANVAS_CODE_PLAN.md`):

1. Log into the Wize AI web app (`apps/web`).
2. Go to **Connect Canvas**, paste in the base URL from step 1 and the token from step 3. A bad
   token/URL should now surface an error instead of silently "succeeding" — that's the connect-time
   validation call to `GET /api/v1/users/self`.
3. Go to **Connect WhatsApp** and enter the same phone number you'll message the bot from — any
   format works, it gets normalized to digits before matching against the inbound WhatsApp sender.

## Known limitation, not fixed by this milestone

The Canvas token is stored in plaintext in the `canvas_connections` table (same as today's mock
design, and the same posture as the WhatsApp access token in `apps/api/.env`). Worth encrypting at
rest eventually, not scoped into this change unless you want it pulled in.
