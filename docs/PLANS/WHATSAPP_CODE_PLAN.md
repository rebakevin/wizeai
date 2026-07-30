# WhatsApp chat-only milestone — code plan

Goal: a student can hold a normal, multi-turn, ChatGPT-like conversation with the agent over
WhatsApp. Advice, feedback, general chat. **No actions yet** (no Canvas pull, no task
breakdown, no calendar scheduling) — those come in a later milestone.

The inbound loop already exists end-to-end and is committed:
`POST /api/whatsapp/webhook` → signature check → immediate 200 ack → parse Meta's payload →
`assistantService.chat(wa_id, text)` → `graphClient.sendText()`. Nothing in that chain is
stubbed. What's missing is robustness and diagnosability (every failure mode currently looks
identical: silence) and chat quality (tools can fire mid-conversation, replies can exceed
WhatsApp's length limit, no read receipt/typing indicator).

## Changes

### 1. `apps/api/src/assistant/agent.ts` — chat-only

`const ENABLE_TOOLS = false;` at module top; `tools: ENABLE_TOOLS ? [...] : []`. Rewrite the
instruction as a pure conversational persona: keep the dynamic date injection, restrict to
WhatsApp-safe formatting (`*bold*`, `_italic_`, no headers/tables), keep replies to 2-4
sentences by default, and explicitly say it can't yet access Canvas/calendar/tasks so it
doesn't hallucinate having taken an action.

### 2. `apps/api/src/whatsapp/messageFormat.ts` (new)

`chunkForWhatsapp(text, limit = 3900): string[]` — WhatsApp's text body caps at 4096 chars;
over that, Graph returns 400 and the student gets nothing. Split on `\n\n` → `\n` → sentence
boundary → space → hard cut, with a guard against an infinite loop on a no-whitespace input.
Small `bun test` file covering the three edge cases.

### 3. `apps/api/src/whatsapp/inboundQueue.ts` (new)

`enqueue(key, fn)` — per-user serialization (chain promises per `wa_id`) so two fast messages
don't race the same ADK session. `markSeen(id): boolean` — bounded dedupe set (cap ~500) so a
Meta redelivery doesn't produce a duplicate reply.

### 4. `apps/api/src/whatsapp/graphClient.ts`

Extract shared `postMessages(payload)` from `sendText`; add `sendReadReceiptAndTyping(messageId)`
— one call that marks the inbound message read and shows the typing indicator
(`{status:"read", typing_indicator:{type:"text"}}`), auto-dismissing after 25s or on reply.

### 5. `apps/api/src/whatsapp/realWhatsappClient.ts` (bulk of the diff)

- Widen `WebhookPayloadSchema` to capture `id`, `timestamp` on messages, and `statuses` on
  `value` (still all optional — a parse failure must never mean silence).
- Log every inbound webhook unconditionally (`[whatsapp] inbound: N message(s), M status(es)`)
  — the single highest-value change for diagnosing "did it even arrive."
- Dedupe on `message.id` synchronously (before any `await`) via `markSeen`.
- Skip messages older than ~5 minutes (`timestamp`), logged — handles Meta's retry bursts after
  a reconnect.
- Log `status === "failed"` entries from `statuses`.
- Non-text messages get a reply ("I can only read text right now") instead of silent `continue`.
- Text messages go through `enqueue(from, ...)`; inside: fire-and-forget
  `sendReadReceiptAndTyping`, then a `try/catch` around `chat()` with a user-facing fallback
  reply on failure, then a **separate** `try/catch` around the chunked `sendMessage` loop — so a
  chat failure and a send failure are distinguishable in logs.

### 6. `apps/api/src/config/env.ts` + both `.env.example` files

Bump `WHATSAPP_API_VERSION` default `v21.0` → `v23.0` (typing indicators postdate v21.0).

### 7. `CLAUDE.md`

Document chat-only mode + the one-line flip to re-enable tools, `start` vs `dev` for WhatsApp
testing, and the queue/dedupe/chunking behavior in the WhatsApp bullet.

## Deliberately out of scope

Message/conversation DB tables, linking `wa_id` to a `users` row, Graph 429/5xx retry, rate
limiting, persisting the dedupe set across restarts, a typing keepalive loop, ADK session
persistence via `DatabaseSessionService` (would need a separate database — its table names
collide with Better Auth's `sessions` table).

Use `bun run --cwd apps/api start` (no `--watch`) while testing WhatsApp conversations, so a
file save mid-conversation doesn't wipe the in-memory ADK session. Keep `dev:api` for
everything else.

## Verification

1. `curl -X POST localhost:3001/api/agent/chat -d '{"message":"hey, tips for staying focused?"}'`
   — no tool fires, 2-4 sentences, no markdown headers, no hallucinated actions.
2. Over WhatsApp (`start`, ngrok up): 6+ turn conversation with correct recall; typing bubble
   within ~1s; voice note → text-only reply, not silence; duplicate message → one reply; a long
   answer arrives as ordered chunks with no mid-word cuts; broken `GEMINI_API_KEY` → fallback
   text, not silence.
3. `bun run --cwd apps/api typecheck` and `bun run lint` clean.
