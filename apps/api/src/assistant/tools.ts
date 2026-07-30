import { randomUUID } from "node:crypto";
import { FunctionTool } from "@google/adk";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import type { ScheduleResult } from "@wizeai/shared/types";
import { db } from "../db/client";
import { tasks as tasksTable } from "../db/schema";
import { calendarClient } from "../calendar/realCalendarClient";
import { canvasClient } from "../canvas/realCanvasClient";
import { generate as generatePlan } from "../planner/plannerService";
import { createSchedule } from "../scheduler/schedulerService";

interface SessionTask {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
}

const DEFAULT_SCHEDULE_WINDOW_DAYS = 7;

export const breakdownAssignmentTool = new FunctionTool({
  name: "breakdown_assignment",
  description:
    "Break a student assignment down into a short list of concrete, time-boxed study tasks. " +
    "Call this whenever the user describes an assignment they need to plan for.",
  parameters: z.object({
    title: z.string().describe("The assignment's title."),
    description: z.string().optional().describe("Any extra detail about the assignment."),
    deadline: z.string().describe("The assignment's deadline, as an ISO 8601 date-time string."),
    sessionCount: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Number of study sessions, if the student specified one. Omit otherwise."),
    sessionMinutes: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Minutes per study session, if the student specified one. Omit otherwise."),
  }),
  async execute({ title, description, deadline, sessionCount, sessionMinutes }, toolContext) {
    const breakdown = await generatePlan({
      assignment: { title, description: description ?? null, deadline: new Date(deadline) },
      constraints:
        sessionCount !== undefined || sessionMinutes !== undefined
          ? { taskCount: sessionCount, minutesPerTask: sessionMinutes }
          : undefined,
    });

    const tasks: SessionTask[] = breakdown.tasks.map((task) => ({
      id: randomUUID(),
      title: task.title,
      description: task.description,
      estimatedMinutes: task.estimatedMinutes,
    }));

    toolContext?.state.set("current_tasks", tasks);
    toolContext?.state.set("current_schedule", undefined);

    return { tasks };
  },
});

export const rescheduleTasksTool = new FunctionTool({
  name: "reschedule_tasks",
  description:
    "Schedule (or re-schedule) the most recently broken-down tasks into free calendar slots. " +
    "Call this when the user asks to schedule, plan out, or reschedule their study tasks.",
  parameters: z.object({
    rangeStart: z
      .string()
      .optional()
      .describe("ISO 8601 start of the scheduling window. Defaults to now."),
    rangeEnd: z
      .string()
      .optional()
      .describe("ISO 8601 end of the scheduling window. Defaults to 7 days from now."),
  }),
  async execute({ rangeStart, rangeEnd }, toolContext) {
    const tasks = toolContext?.state.get<SessionTask[]>("current_tasks");
    if (!tasks || tasks.length === 0) {
      return { error: "There are no tasks to schedule yet — break down an assignment first." };
    }

    const userId = toolContext?.state.get<string>("user_id") ?? "unknown";
    const start = rangeStart ? new Date(rangeStart) : new Date();
    const end = rangeEnd
      ? new Date(rangeEnd)
      : new Date(start.getTime() + DEFAULT_SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const result = await createSchedule(userId, { tasks, rangeStart: start, rangeEnd: end });
    toolContext?.state.set("current_schedule", result);

    return result;
  },
});

export const getOpenAssignmentsTool = new FunctionTool({
  name: "get_open_assignments",
  description:
    "Fetch the student's open (not yet due) Canvas assignments across all their active courses. " +
    "Call this whenever the student asks what's due, what assignments they have, or similar.",
  async execute(_input, toolContext) {
    const userId = toolContext?.state.get<string>("user_id");
    if (!userId) {
      return { error: "Could not identify the student." };
    }

    try {
      const assignments = await canvasClient.listAssignments(userId);
      return {
        assignments: assignments.map((a) => ({
          title: a.title,
          pointsPossible: a.pointsPossible,
          deadline: a.deadline.toISOString(),
        })),
      };
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch assignments from Canvas.",
      };
    }
  },
});

export const cancelTasksTool = new FunctionTool({
  name: "cancel_tasks",
  description:
    "Cancel the current task breakdown and any schedule made from it, deleting any calendar " +
    "events already created. Call this when the user asks to cancel or drop their current plan.",
  async execute(_input, toolContext) {
    const hadTasks = Boolean(toolContext?.state.get("current_tasks"));
    const schedule = toolContext?.state.get<ScheduleResult>("current_schedule");
    const userId = toolContext?.state.get<string>("user_id");

    if (schedule && userId) {
      await Promise.all(
        schedule.scheduled.map(async (entry) => {
          await calendarClient.deleteEvent(userId, entry.googleEventId);
          await db
            .update(tasksTable)
            .set({ status: "cancelled" })
            .where(eq(tasksTable.id, entry.taskId));
        }),
      );
    }

    toolContext?.state.set("current_tasks", undefined);
    toolContext?.state.set("current_schedule", undefined);
    return { cancelled: hadTasks };
  },
});

export const updateStudySessionTool = new FunctionTool({
  name: "update_study_session",
  description:
    "Edit an already-scheduled study session: change its description and/or move it to a new " +
    "time. Looks the session up by title, so it works even in a new conversation (it's backed by " +
    "the database, not just this chat's memory). Call this when the student asks to reschedule a " +
    "specific session or change what it covers.",
  parameters: z.object({
    title: z
      .string()
      .describe("The study session's title, or close to it, as the student refers to it."),
    newDescription: z.string().optional().describe("New description, if the student wants one."),
    newStart: z
      .string()
      .optional()
      .describe(
        "New ISO 8601 start time, if rescheduling. The session keeps its original duration " +
          "unless newEnd is also given.",
      ),
    newEnd: z
      .string()
      .optional()
      .describe("New ISO 8601 end time. Only meaningful together with newStart."),
  }),
  async execute({ title, newDescription, newStart, newEnd }, toolContext) {
    const userId = toolContext?.state.get<string>("user_id");
    if (!userId) {
      return { error: "Could not identify the student." };
    }
    if (newDescription === undefined && newStart === undefined) {
      return { error: "Nothing to update — specify a new description and/or a new time." };
    }

    const matches = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, userId),
          eq(tasksTable.status, "scheduled"),
          ilike(tasksTable.title, `%${title}%`),
        ),
      );

    if (matches.length === 0) {
      return { error: `No scheduled session matching "${title}" was found.` };
    }
    if (matches.length > 1) {
      return {
        error: `Multiple scheduled sessions match "${title}": ${matches.map((m) => m.title).join(", ")}. Ask which one.`,
      };
    }

    const task = matches[0]!;
    if (!task.googleEventId) {
      return { error: "This session has no linked calendar event to update." };
    }

    const newStartDate = newStart ? new Date(newStart) : undefined;
    const durationMs =
      task.scheduledStart && task.scheduledEnd
        ? task.scheduledEnd.getTime() - task.scheduledStart.getTime()
        : task.estimatedMinutes * 60_000;
    const newEndDate = newEnd
      ? new Date(newEnd)
      : newStartDate
        ? new Date(newStartDate.getTime() + durationMs)
        : undefined;

    await calendarClient.updateEvent(userId, task.googleEventId, {
      ...(newDescription !== undefined ? { description: newDescription } : {}),
      ...(newStartDate ? { start: newStartDate, end: newEndDate } : {}),
    });

    await db
      .update(tasksTable)
      .set({
        ...(newDescription !== undefined ? { description: newDescription } : {}),
        ...(newStartDate ? { scheduledStart: newStartDate, scheduledEnd: newEndDate } : {}),
      })
      .where(eq(tasksTable.id, task.id));

    return { updated: true, title: task.title };
  },
});
