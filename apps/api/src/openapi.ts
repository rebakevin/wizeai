import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { ScheduleResultSchema, TaskBreakdownSchema } from "@wizeai/shared";
import { CanvasConnectSchema } from "./canvas/routes";
import { CalendarConnectSchema } from "./calendar/routes";
import { WhatsappConnectSchema } from "./whatsapp/routes";
import { PlannerGenerateRequestSchema } from "./planner/routes";
import { ScheduleRequestSchema } from "./scheduler/routes";

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
  method: "post",
  path: "/api/calendar/connect",
  summary: "Connect Google Calendar (mocked)",
  tags: ["Calendar"],
  request: { body: { content: { "application/json": { schema: CalendarConnectSchema } } } },
  responses: {
    201: {
      description: "Connected.",
      content: { "application/json": { schema: ConnectedResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/calendar/disconnect",
  summary: "Disconnect Google Calendar",
  tags: ["Calendar"],
  request: { body: { content: { "application/json": { schema: UserIdBodySchema } } } },
  responses: {
    200: {
      description: "Disconnected.",
      content: { "application/json": { schema: ConnectedResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/calendar/sync",
  summary: "Sync Google Calendar events (mocked)",
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
  summary: "Connect WhatsApp (mocked)",
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
  summary: "Receive a WhatsApp webhook event",
  tags: ["WhatsApp"],
  responses: { 200: { description: "Acknowledged." } },
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

export const openApiDocument = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: "3.0.0",
  info: {
    title: "Wize AI API",
    version: "0.0.0",
    description:
      "Canvas, Google Calendar, and WhatsApp integrations are mocked stubs. " +
      "The Planner endpoint calls a real Google ADK agent. " +
      "Auth is handled by Better Auth — see /api/auth/reference for those routes.",
  },
  servers: [{ url: "/" }],
});
