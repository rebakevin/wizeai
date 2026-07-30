import { addMinutes, subtractBusyBlocks } from "@wizeai/shared/utils";
import type { BusyBlock, FreeSlot, ScheduleCreateInput, ScheduleResult } from "@wizeai/shared/types";
import { db } from "../db/client";
import { tasks as tasksTable } from "../db/schema";
import { calendarClient } from "../calendar/realCalendarClient";

type ScheduleTask = ScheduleCreateInput["tasks"][number];

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Splits [rangeStart, rangeEnd) into calendar-day windows, clamped to the range's own edges. */
function enumerateDays(rangeStart: Date, rangeEnd: Date): { start: Date; end: Date }[] {
  const days: { start: Date; end: Date }[] = [];
  let cursor = startOfUtcDay(rangeStart);

  while (cursor < rangeEnd) {
    const nextMidnight = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    days.push({
      start: cursor > rangeStart ? cursor : rangeStart,
      end: nextMidnight < rangeEnd ? nextMidnight : rangeEnd,
    });
    cursor = nextMidnight;
  }

  return days;
}

async function persistScheduledTask(
  userId: string,
  task: ScheduleTask,
  start: Date,
  end: Date,
  googleEventId: string,
): Promise<void> {
  const values = {
    userId,
    title: task.title,
    description: task.description ?? null,
    estimatedMinutes: task.estimatedMinutes,
    googleEventId,
    scheduledStart: start,
    scheduledEnd: end,
    status: "scheduled" as const,
  };

  await db
    .insert(tasksTable)
    .values({ id: task.id, ...values })
    .onConflictDoUpdate({ target: tasksTable.id, set: values });
}

/**
 * Places tasks across the days in [rangeStart, rangeEnd), round-robin: task N's preferred day is
 * day (N mod dayCount), falling back to the next available day (in order) if its preferred day
 * has no free slot big enough. This spreads sessions across the range instead of packing them all
 * into the first day's free time, which is what plain earliest-slot-first scheduling does. Each
 * successfully scheduled task is persisted to `tasks` (upserted by id) alongside the real calendar
 * event. Tasks that don't fit anywhere in the range come back as `unscheduled`.
 */
export async function createSchedule(
  userId: string,
  input: ScheduleCreateInput,
): Promise<ScheduleResult> {
  const busyBlocks = await calendarClient.getEvents(userId, input.rangeStart, input.rangeEnd);
  const days = enumerateDays(input.rangeStart, input.rangeEnd);
  const freeSlotsByDay: FreeSlot[][] = days.map((day) =>
    subtractBusyBlocks(day.start, day.end, busyBlocks as BusyBlock[]),
  );

  const scheduled: ScheduleResult["scheduled"] = [];
  const unscheduled: string[] = [];

  for (const [index, task] of input.tasks.entries()) {
    let placed = false;

    for (let offset = 0; offset < days.length && !placed; offset++) {
      const dayIndex = (index + offset) % days.length;
      const freeSlots = freeSlotsByDay[dayIndex]!;
      const slotIndex = freeSlots.findIndex(
        (slot) => (slot.end.getTime() - slot.start.getTime()) / 60_000 >= task.estimatedMinutes,
      );
      if (slotIndex === -1) continue;

      const slot = freeSlots[slotIndex]!;
      const start = slot.start;
      const end = addMinutes(start, task.estimatedMinutes);

      const createdEvent = await calendarClient.createEvent(userId, {
        title: task.title,
        description: task.description,
        start,
        end,
      });
      await persistScheduledTask(userId, task, start, end, createdEvent.googleEventId);
      scheduled.push({ taskId: task.id, googleEventId: createdEvent.googleEventId, start, end });

      if (end.getTime() === slot.end.getTime()) {
        freeSlots.splice(slotIndex, 1);
      } else {
        freeSlots[slotIndex] = { start: end, end: slot.end };
      }
      placed = true;
    }

    if (!placed) unscheduled.push(task.id);
  }

  return { scheduled, unscheduled };
}

export async function reschedule(
  userId: string,
  input: ScheduleCreateInput,
): Promise<ScheduleResult> {
  return createSchedule(userId, input);
}
