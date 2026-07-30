export interface CalendarEventInput {
  title: string;
  description?: string;
  start: Date;
  end: Date;
}

export interface CalendarEventRecord extends CalendarEventInput {
  googleEventId: string;
}

export interface CalendarClient {
  getEvents(userId: string, rangeStart: Date, rangeEnd: Date): Promise<CalendarEventRecord[]>;
  createEvent(userId: string, event: CalendarEventInput): Promise<CalendarEventRecord>;
  updateEvent(
    userId: string,
    googleEventId: string,
    event: Partial<CalendarEventInput>,
  ): Promise<CalendarEventRecord>;
  deleteEvent(userId: string, googleEventId: string): Promise<void>;
}
