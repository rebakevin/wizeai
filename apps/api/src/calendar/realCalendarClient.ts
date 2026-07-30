import { auth } from "../auth/auth";
import type { CalendarClient, CalendarEventInput, CalendarEventRecord } from "./calendarClient";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface GoogleEventDateTime {
  dateTime?: string;
  date?: string;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
}

interface GoogleEventListResponse {
  items?: GoogleEvent[];
}

async function getAccessToken(userId: string): Promise<string> {
  const result = await auth.api.getAccessToken({
    body: { providerId: "google", userId },
  });

  if (!result.accessToken) {
    throw new Error("Google Calendar is not connected for this account.");
  }

  return result.accessToken;
}

async function googleFetch<T>(userId: string, path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken(userId);
  const response = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Google Calendar API request to ${path} failed: ${response.status} ${response.statusText}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function toEventRecord(event: GoogleEvent): CalendarEventRecord {
  const start = event.start.dateTime ?? event.start.date;
  const end = event.end.dateTime ?? event.end.date;
  if (!start || !end) {
    throw new Error(`Google Calendar event ${event.id} is missing start/end`);
  }

  return {
    googleEventId: event.id,
    title: event.summary ?? "(untitled)",
    description: event.description,
    start: new Date(start),
    end: new Date(end),
  };
}

function toGoogleEventBody(event: Partial<CalendarEventInput>) {
  return {
    ...(event.title !== undefined ? { summary: event.title } : {}),
    ...(event.description !== undefined ? { description: event.description } : {}),
    ...(event.start !== undefined
      ? { start: { dateTime: event.start.toISOString(), timeZone: "UTC" } }
      : {}),
    ...(event.end !== undefined
      ? { end: { dateTime: event.end.toISOString(), timeZone: "UTC" } }
      : {}),
  };
}

export class RealCalendarClient implements CalendarClient {
  async getEvents(
    userId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<CalendarEventRecord[]> {
    const params = new URLSearchParams({
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
    });

    const { items = [] } = await googleFetch<GoogleEventListResponse>(userId, `?${params}`);
    return items.map(toEventRecord);
  }

  async createEvent(userId: string, event: CalendarEventInput): Promise<CalendarEventRecord> {
    const created = await googleFetch<GoogleEvent>(userId, "", {
      method: "POST",
      body: JSON.stringify(toGoogleEventBody(event)),
    });
    return toEventRecord(created);
  }

  async updateEvent(
    userId: string,
    googleEventId: string,
    event: Partial<CalendarEventInput>,
  ): Promise<CalendarEventRecord> {
    const updated = await googleFetch<GoogleEvent>(userId, `/${googleEventId}`, {
      method: "PATCH",
      body: JSON.stringify(toGoogleEventBody(event)),
    });
    return toEventRecord(updated);
  }

  async deleteEvent(userId: string, googleEventId: string): Promise<void> {
    await googleFetch<void>(userId, `/${googleEventId}`, { method: "DELETE" });
  }
}

export const calendarClient: CalendarClient = new RealCalendarClient();
