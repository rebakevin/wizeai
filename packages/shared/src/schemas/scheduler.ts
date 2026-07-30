import { z } from "zod";

export const BusyBlockSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

export const FreeSlotSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

export const ScheduleCreateInputSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        estimatedMinutes: z.number().int().positive(),
      }),
    )
    .min(1),
  rangeStart: z.coerce.date(),
  rangeEnd: z.coerce.date(),
});

export const ScheduledTaskSchema = z.object({
  taskId: z.string(),
  googleEventId: z.string(),
  start: z.coerce.date(),
  end: z.coerce.date(),
});

export const ScheduleResultSchema = z.object({
  scheduled: z.array(ScheduledTaskSchema),
  unscheduled: z.array(z.string()),
});
