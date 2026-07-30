export interface CalendarEventInput {
  title: string;
  start: Date;
  end: Date;
}

export interface CalendarEventRecord extends CalendarEventInput {
  googleEventId: string;
}

export interface CalendarClient {
  connect(userId: string, accessToken: string, refreshToken?: string): Promise<void>;
  disconnect(userId: string): Promise<void>;
  isConnected(userId: string): Promise<boolean>;
  getEvents(userId: string, rangeStart: Date, rangeEnd: Date): Promise<CalendarEventRecord[]>;
  createEvent(userId: string, event: CalendarEventInput): Promise<CalendarEventRecord>;
  updateEvent(
    userId: string,
    googleEventId: string,
    event: Partial<CalendarEventInput>,
  ): Promise<CalendarEventRecord>;
  deleteEvent(userId: string, googleEventId: string): Promise<void>;
}
