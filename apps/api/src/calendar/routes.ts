import { Router } from "express";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth";
import { DEMO_USER_ID } from "../lib/demoUser";
import { calendarClient } from "./mockCalendarClient";

export const calendarRouter = Router();

export const CalendarConnectSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
});

calendarRouter.post("/connect", async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const body = CalendarConnectSchema.parse(req.body ?? {});
  await calendarClient.connect(session.user.id, body.accessToken, body.refreshToken);
  res.status(201).json({ connected: true });
});

calendarRouter.post("/disconnect", async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  await calendarClient.disconnect(session.user.id);
  res.json({ connected: false });
});

calendarRouter.get("/status", async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({ connected: await calendarClient.isConnected(session.user.id) });
});

calendarRouter.post("/sync", async (req, res) => {
  const body = z
    .object({
      userId: z.string().default(DEMO_USER_ID),
      rangeStart: z.coerce.date().default(() => new Date()),
      rangeEnd: z.coerce.date().default(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    })
    .parse(req.body ?? {});
  const events = await calendarClient.getEvents(body.userId, body.rangeStart, body.rangeEnd);
  res.json({ synced: events.length, events });
});
