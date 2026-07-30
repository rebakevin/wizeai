# Google Calendar — platform setup

Goal: get a Google OAuth client that can grant Calendar access, so the `linkSocial`/
`getAccessToken` flow described in `GOOGLE_CALENDAR_CODE_PLAN.md` has something real to talk to.
This reuses Better Auth's existing account-linking, not a hand-rolled OAuth2 flow — no custom
callback routes to register beyond what Better Auth already owns.

## 1. Enable the Calendar API

**Google Cloud Console** → select or create a project → **APIs & Services → Library** → search
**Google Calendar API** → **Enable**.

## 2. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen**:
- User type: **External** is fine for testing.
- Scopes: add `https://www.googleapis.com/auth/calendar.events`.
- **Test users**: add your own Google account (and anyone else testing this). `calendar.events` is
  a "sensitive" scope — while the app is in **Testing** publishing status, only explicitly-added
  test-user accounts can complete the consent flow. No Google verification review is needed for
  testing; that review only matters if you later move to "In production."

## 3. Create (or reuse) an OAuth client

**APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type
**Web application**.

Under **Authorized redirect URIs**, add:
```
http://localhost:3001/api/auth/callback/google
```
(That's `${BETTER_AUTH_URL}/api/auth/callback/google` — adjust the host if your `BETTER_AUTH_URL`
differs, e.g. in a deployed environment.)

If Google sign-in is already configured for this app with this same redirect URI, you can reuse
that OAuth client — Calendar access is just an additional scope requested through the same client,
not a separate app registration. Otherwise, create a fresh client.

## 4. Set the env vars

Copy the **Client ID** and **Client secret** into `apps/api/.env`:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```
These already exist in `apps/api/src/config/env.ts` (currently optional, used only for Google
sign-in) — they become load-bearing for Calendar too. Without them set, `linkSocial({ provider:
"google", ... })` will fail cleanly since Better Auth won't have "google" registered as a provider.

## 5. Nothing else needed

- No public HTTPS tunnel required for this one (unlike WhatsApp) — Google allows
  `http://localhost` redirect URIs for testing, so local dev works without ngrok.
- No separate backend OAuth callback route to build or register — Better Auth's existing
  `/api/auth/*` handler owns the whole redirect/token-exchange flow.

## Known limitations, not fixed by this milestone

- OAuth tokens are stored in plaintext in Better Auth's `accounts` table (same posture as the
  Canvas token and the WhatsApp access token). Better Auth supports `account.encryptOAuthTokens:
  true` to encrypt them at rest — worth turning on eventually, not required for this to work.
- Staying in "Testing" publishing status means only accounts you've explicitly added as test users
  can connect Calendar. Moving to production for a sensitive scope like `calendar.events` requires
  Google's app verification review — not needed to build or demo this, only before real users
  beyond your test list would need to connect.
