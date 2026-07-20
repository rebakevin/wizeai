import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { googleConnections } from "../db/schema";
import type {
  CalendarClient,
  CalendarEventInput,
  CalendarEventRecord,
} from "./calendarClient";

function fixtureBusyBlocks(): CalendarEventRecord[] {
  const now = new Date();
  const tomorrow10am = new Date(now);
  tomorrow10am.setDate(tomorrow10am.getDate() + 1);
  tomorrow10am.setHours(10, 0, 0, 0);

  return [
    {
      googleEventId: `fixture-${randomUUID()}`,
      title: "Calculus II Lecture",
      start: tomorrow10am,
      end: new Date(tomorrow10am.getTime() + 60 * 60_000),
    },
  ];
}

const eventsByUser = new Map<string, CalendarEventRecord[]>();

function getUserEvents(userId: string): CalendarEventRecord[] {
  let events = eventsByUser.get(userId);
  if (!events) {
    events = fixtureBusyBlocks();
    eventsByUser.set(userId, events);
  }
  return events;
}

export class MockCalendarClient implements CalendarClient {
  async connect(userId: string, accessToken: string, refreshToken?: string): Promise<void> {
    await db.insert(googleConnections).values({
      id: randomUUID(),
      userId,
      accessToken,
      refreshToken: refreshToken ?? null,
    });
  }

  async disconnect(userId: string): Promise<void> {
    await db.delete(googleConnections).where(eq(googleConnections.userId, userId));
    eventsByUser.delete(userId);
  }

  async getEvents(
    userId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<CalendarEventRecord[]> {
    return getUserEvents(userId).filter(
      (event) => event.end > rangeStart && event.start < rangeEnd,
    );
  }

  async createEvent(userId: string, event: CalendarEventInput): Promise<CalendarEventRecord> {
    const record: CalendarEventRecord = { ...event, googleEventId: randomUUID() };
    getUserEvents(userId).push(record);
    return record;
  }

  async updateEvent(
    userId: string,
    googleEventId: string,
    event: Partial<CalendarEventInput>,
  ): Promise<CalendarEventRecord> {
    const events = getUserEvents(userId);
    const index = events.findIndex((e) => e.googleEventId === googleEventId);
    if (index === -1) {
      throw new Error(`Calendar event ${googleEventId} not found for user ${userId}`);
    }
    const updated = { ...events[index]!, ...event };
    events[index] = updated;
    return updated;
  }

  async deleteEvent(userId: string, googleEventId: string): Promise<void> {
    const events = getUserEvents(userId);
    eventsByUser.set(
      userId,
      events.filter((e) => e.googleEventId !== googleEventId),
    );
  }
}

export const calendarClient: CalendarClient = new MockCalendarClient();
