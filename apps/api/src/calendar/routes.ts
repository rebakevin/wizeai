import { Router } from "express";
import { z } from "zod";
import { DEMO_USER_ID } from "../lib/demoUser";
import { calendarClient } from "./mockCalendarClient";

export const calendarRouter = Router();

export const CalendarConnectSchema = z.object({
  userId: z.string().default(DEMO_USER_ID),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
});

calendarRouter.post("/connect", async (req, res) => {
  const body = CalendarConnectSchema.parse(req.body ?? {});
  await calendarClient.connect(body.userId, body.accessToken, body.refreshToken);
  res.status(201).json({ connected: true });
});

calendarRouter.post("/disconnect", async (req, res) => {
  const body = z.object({ userId: z.string().default(DEMO_USER_ID) }).parse(req.body ?? {});
  await calendarClient.disconnect(body.userId);
  res.json({ connected: false });
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
