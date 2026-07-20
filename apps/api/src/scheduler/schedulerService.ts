import { addMinutes, subtractBusyBlocks } from "@wizeai/shared/utils";
import type { ScheduleCreateInput, ScheduleResult } from "@wizeai/shared/types";
import { calendarClient } from "../calendar/mockCalendarClient";

/**
 * Greedily places tasks into the earliest available free slots within
 * [rangeStart, rangeEnd), splitting a slot across a task if the slot is
 * bigger than the task needs but leaving it alone otherwise. Tasks that
 * don't fit anywhere in the range come back as `unscheduled`.
 */
export async function createSchedule(
  userId: string,
  input: ScheduleCreateInput,
): Promise<ScheduleResult> {
  const busyBlocks = await calendarClient.getEvents(userId, input.rangeStart, input.rangeEnd);
  const freeSlots = subtractBusyBlocks(input.rangeStart, input.rangeEnd, busyBlocks).map(
    (slot) => ({ ...slot }),
  );

  const scheduled: ScheduleResult["scheduled"] = [];
  const unscheduled: string[] = [];

  for (const task of input.tasks) {
    const slotIndex = freeSlots.findIndex(
      (slot) => (slot.end.getTime() - slot.start.getTime()) / 60_000 >= task.estimatedMinutes,
    );

    if (slotIndex === -1) {
      unscheduled.push(task.id);
      continue;
    }

    const slot = freeSlots[slotIndex]!;
    const start = slot.start;
    const end = addMinutes(start, task.estimatedMinutes);

    await calendarClient.createEvent(userId, { title: task.title, start, end });
    scheduled.push({ taskId: task.id, start, end });

    if (end.getTime() === slot.end.getTime()) {
      freeSlots.splice(slotIndex, 1);
    } else {
      freeSlots[slotIndex] = { start: end, end: slot.end };
    }
  }

  return { scheduled, unscheduled };
}

export async function reschedule(
  userId: string,
  input: ScheduleCreateInput,
): Promise<ScheduleResult> {
  return createSchedule(userId, input);
}
