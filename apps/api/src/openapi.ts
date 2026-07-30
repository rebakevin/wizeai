import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { ScheduleResultSchema, TaskBreakdownSchema } from "@wizeai/shared";
import { CanvasConnectSchema } from "./canvas/routes";
import { WhatsappConnectSchema } from "./whatsapp/routes";
import { PlannerGenerateRequestSchema } from "./planner/routes";
import { ScheduleRequestSchema } from "./scheduler/routes";
import { ChatRequestSchema } from "./assistant/routes";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const ConnectedResponseSchema = z.object({ connected: z.boolean() });
const UserIdBodySchema = z.object({ userId: z.string().optional() });

registry.registerPath({
  method: "get",
  path: "/health",
  summary: "Liveness check",
  tags: ["System"],
  responses: {
    200: {
      description: "The API is up.",
      content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/me",
  summary: "Get the current session",
  tags: ["Auth"],
  responses: {
    200: { description: "The current session and user." },
    401: { description: "Not authenticated." },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/canvas/connect",
  summary: "Connect a Canvas account (mocked)",
  tags: ["Canvas"],
  request: { body: { content: { "application/json": { schema: CanvasConnectSchema } } } },
  responses: {
    201: {
      description: "Connected.",
      content: { "application/json": { schema: ConnectedResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/canvas/disconnect",
  summary: "Disconnect a Canvas account",
  tags: ["Canvas"],
  request: { body: { content: { "application/json": { schema: UserIdBodySchema } } } },
  responses: {
    200: {
      description: "Disconnected.",
      content: { "application/json": { schema: ConnectedResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/canvas/assignments",
  summary: "List Canvas assignments (mocked fixtures)",
  tags: ["Canvas"],
  request: { query: z.object({ userId: z.string().optional() }) },
  responses: { 200: { description: "Assignments for the user." } },
});

registry.registerPath({
  method: "post",
  path: "/api/canvas/sync",
  summary: "Sync Canvas assignments (mocked)",
  tags: ["Canvas"],
  request: { body: { content: { "application/json": { schema: UserIdBodySchema } } } },
  responses: { 200: { description: "Sync result." } },
});

registry.registerPath({
  method: "get",
  path: "/api/calendar/status",
  summary: "Check whether Google Calendar is connected for the current session user",
  description:
    "Connecting/disconnecting happens client-side via Better Auth's linkSocial/unlinkAccount " +
    "(Google account linking with the calendar.events scope) — this route just reports status.",
  tags: ["Calendar"],
  responses: {
    200: {
      description: "Connection status.",
      content: { "application/json": { schema: ConnectedResponseSchema } },
    },
    401: { description: "Not authenticated." },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/calendar/sync",
  summary: "Sync Google Calendar events",
  tags: ["Calendar"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: UserIdBodySchema.extend({
            rangeStart: z.string().datetime().optional(),
            rangeEnd: z.string().datetime().optional(),
          }),
        },
      },
    },
  },
  responses: { 200: { description: "Sync result." } },
});

registry.registerPath({
  method: "post",
  path: "/api/whatsapp/connect",
  summary: "Record a WhatsApp phone number for a user account",
  description:
    "Writes a whatsapp_connections row. Not yet consulted by the chat flow below — inbound " +
    "messages are handled per phone number regardless of any linked account.",
  tags: ["WhatsApp"],
  request: { body: { content: { "application/json": { schema: WhatsappConnectSchema } } } },
  responses: {
    201: {
      description: "Connected.",
      content: { "application/json": { schema: ConnectedResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/whatsapp/webhook",
  summary: "WhatsApp webhook verification handshake",
  description: "Called once by Meta when you save the Callback URL in the app dashboard.",
  tags: ["WhatsApp"],
  request: {
    query: z.object({
      "hub.mode": z.string(),
      "hub.verify_token": z.string(),
      "hub.challenge": z.string(),
    }),
  },
  responses: {
    200: { description: "Challenge echoed back." },
    403: { description: "Invalid verify token." },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/whatsapp/webhook",
  summary: "Receive a WhatsApp message event",
  description:
    "Called by Meta for each inbound message/status event. Acks immediately, then " +
    "asynchronously replies to any text message via the same agent as POST /api/agent/chat, " +
    "using the sender's phone number as the chat session's userId.",
  tags: ["WhatsApp"],
  responses: { 200: { description: "Acknowledged." }, 403: { description: "Invalid signature." } },
});

registry.registerPath({
  method: "post",
  path: "/api/whatsapp/send",
  summary: "Send a WhatsApp text message directly (dev/testing convenience)",
  tags: ["WhatsApp"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ to: z.string(), text: z.string() }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Sent.",
      content: { "application/json": { schema: z.object({ messageId: z.string() }) } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/planner/generate",
  summary: "Break an assignment into tasks with the Google ADK planner agent",
  tags: ["Planner"],
  request: {
    body: { content: { "application/json": { schema: PlannerGenerateRequestSchema } } },
  },
  responses: {
    201: {
      description: "The generated task breakdown.",
      content: { "application/json": { schema: TaskBreakdownSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/schedule/create",
  summary: "Schedule tasks into free calendar slots",
  tags: ["Scheduler"],
  request: {
    body: { content: { "application/json": { schema: ScheduleRequestSchema } } },
  },
  responses: {
    201: {
      description: "The resulting schedule.",
      content: { "application/json": { schema: ScheduleResultSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/schedule/reschedule",
  summary: "Re-run scheduling for a set of tasks",
  tags: ["Scheduler"],
  request: {
    body: { content: { "application/json": { schema: ScheduleRequestSchema } } },
  },
  responses: {
    200: {
      description: "The resulting schedule.",
      content: { "application/json": { schema: ScheduleResultSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agent/chat",
  summary: "Talk to the Wize AI assistant",
  description:
    "General-purpose conversational endpoint backed by a Google ADK agent with tools for " +
    "breaking down an assignment into tasks, (re)scheduling them, and cancelling the current " +
    "plan. Conversation state persists in-memory per userId for the life of the server process.",
  tags: ["Assistant"],
  request: {
    body: { content: { "application/json": { schema: ChatRequestSchema } } },
  },
  responses: {
    200: {
      description: "The assistant's reply.",
      content: { "application/json": { schema: z.object({ reply: z.string() }) } },
    },
  },
});

export const openApiDocument = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: "3.0.0",
  info: {
    title: "Wize AI API",
    version: "0.0.0",
    description:
      "Canvas, Google Calendar, and WhatsApp are real integrations; the Planner and Assistant " +
      "endpoints call real Google ADK agents. " +
      "Auth is handled by Better Auth — see /api/auth/reference for those routes.",
  },
  servers: [{ url: "/" }],
});
