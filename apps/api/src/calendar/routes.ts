import { Router } from "express";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth";
import { DEMO_USER_ID } from "../lib/demoUser";
import { calendarClient } from "./realCalendarClient";
import { isCalendarConnected } from "./googleAccountStatus";

export const calendarRouter = Router();

calendarRouter.get("/status", async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({ connected: await isCalendarConnected(session.user.id) });
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
