# WhatsApp Cloud API — Meta dashboard setup (dev/test only)

Goal: prove a student can hold a normal back-and-forth conversation with the agent over
WhatsApp. This covers only what's needed for that — no production setup.

## What you can skip entirely right now

- **Step 2 "Production setup"** (register your own phone number, add payment) and
  **Step 3 "Business verification"** — both production-only.
- The phone-number rejection you hit ("already linked to a WhatsApp account") is expected —
  a number can't be both a consumer/WhatsApp Business app account and a Cloud API number at
  the same time. Not a problem to solve now.

The Meta-provided **test number** (`+1 (555) 150-5822`, Phone Number ID `1221052707758751` —
already correctly in `apps/api/.env`) needs no business verification and no payment, and can
hold real two-way conversations with up to 5 allow-listed recipient numbers. That's everything
this milestone needs.

## Update: inbound delivery to Meta is confirmed working

The "Check test webhooks" panel (Step 1 → Send a message from your test number) is showing
real entries with recent timestamps every time you message the test number from your phone.
**That confirms Meta is receiving your messages and generating webhook events for them.**

What it does **not** confirm is that those events successfully reached your server and that
your server replied. That panel logs the event Meta generated — it isn't proof of a completed
delivery to your callback URL. The remaining gap is almost certainly on the app side (is the
server/ngrok tunnel actually up when you test, and does the code process + reply correctly —
see `WHATSAPP_CODE_PLAN.md`), not the Meta configuration.

Keep these as quick sanity checks if a reply still doesn't arrive after the code changes:

### Check 1 — is your access token valid?

```bash
PHONE_ID=1221052707758751
TOKEN='<paste WHATSAPP_ACCESS_TOKEN from apps/api/.env>'

curl -s "https://graph.facebook.com/v23.0/$PHONE_ID?fields=display_phone_number,verified_name" \
  -H "Authorization: Bearer $TOKEN"
```

Expect `display_phone_number: "+1 555 150-5822"`. An OAuth error means the token is expired or
belongs to a different app — regenerate a System User token (Business Settings → Users →
System Users → Add → Admin role → Generate token → this app → scopes
`whatsapp_business_messaging` + `whatsapp_business_management`). System User tokens don't
expire; the dashboard's own "Generate token" button gives a 24-hour token that will strand you
tomorrow.

### Check 2 — is your app subscribed to the WABA?

```bash
WABA_ID=1357224159315007

curl -s "https://graph.facebook.com/v23.0/$WABA_ID/subscribed_apps" \
  -H "Authorization: Bearer $TOKEN"
```

If `data` is `[]`, subscribe:

```bash
curl -X POST "https://graph.facebook.com/v23.0/$WABA_ID/subscribed_apps" \
  -H "Authorization: Bearer $TOKEN"
```

Given the "Check test webhooks" panel is populating, this is very likely already fine — treat
as a 10-second sanity check, not the primary suspect anymore.

### Check 3 — is the tunnel actually up and pointed at the right domain?

Your `.env` has a **static** ngrok domain (good — it survives restarts, unlike a rotating free
ngrok URL which would silently break a previously-saved callback URL):

```bash
ngrok http --url=declive-somer-nonbibulous.ngrok-free.dev 3001
```

Then, with the API running, prove the path from outside:

```bash
curl "https://declive-somer-nonbibulous.ngrok-free.dev/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=test123"
# must print exactly: test123
```

### Check 4 — fill in `WHATSAPP_APP_SECRET`

Currently empty in `apps/api/.env`, so `isValidSignature()`
(`apps/api/src/whatsapp/routes.ts:23-31`) returns `true` unconditionally — the webhook is a
public, unauthenticated endpoint on a public ngrok URL that triggers real outbound sends.

App Dashboard → App Settings → Basic → **App Secret** → Show → paste into `apps/api/.env`.

## Update: outbound sends failing with access-denied — root cause found

Symptom: inbound webhooks worked fine, but every outbound send failed — both `sendText` in the
app (`403 (#131005) Access denied`) and Meta's own App Dashboard "Send message" test button
(same recipient, "There was a problem with the access token or permissions"). The fact that
Meta's own dashboard button failed too (not just our code) was the key signal this wasn't an
app/token/`.env` issue at all.

Diagnosis, in order:
1. `GET /v23.0/{PHONE_NUMBER_ID}?fields=display_phone_number,verified_name` — token authenticates
   fine, rules out an invalid/wrong-app token.
2. `GET /v23.0/debug_token?input_token=...&access_token=...` — token has both
   `whatsapp_business_messaging` and `whatsapp_business_management` scopes and wasn't expired,
   ruling out a permissions/scope or expiry problem.
3. `GET /v23.0/{WABA_ID}/phone_numbers` for each WABA the token's `whatsapp_business_management`
   scope listed target_ids for — this is what found it: the test number's own
   `code_verification_status` is `"NOT_VERIFIED"`. **A phone number that hasn't completed
   verification can receive webhooks and answer metadata reads, but Meta blocks it from sending
   anything** — which is exactly the mismatch between "webhooks work" and "every send fails."

Fix: App Dashboard → WhatsApp → API Setup → the "From" number section (or
business.facebook.com → WhatsApp Manager → Phone Numbers) → find a **Verify** / complete-setup
action next to the test number and trigger it. For Meta's own shared test number this is
typically a one-click confirmation, not an SMS you need to actually receive on a device you don't
have. Re-check with:

```bash
curl -s "https://graph.facebook.com/v23.0/1357224159315007/phone_numbers" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['code_verification_status'])"
```

Expect `VERIFIED` before retrying a send.

## Constraint worth knowing now (nothing to do yet)

Meta's **24-hour customer service window**: free-form text replies are only allowed within 24h
of the student's last message. Outside it, you need a pre-approved message template. Deadline
reminders (the actual product) are business-initiated, so they'll eventually need approved
templates + a payment method. Not relevant to this chat-only milestone — just don't be
surprised by it later.
