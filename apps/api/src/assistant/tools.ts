import { randomUUID } from "node:crypto";
import { FunctionTool } from "@google/adk";
import { and, desc, eq, ilike, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { tasks as tasksTable } from "../db/schema";
import { calendarClient } from "../calendar/realCalendarClient";
import { canvasClient } from "../canvas/realCanvasClient";
import { generate as generatePlan } from "../planner/plannerService";
import { createSchedule } from "../scheduler/schedulerService";
import {
  formatAssignmentList,
  formatCancelConfirmation,
  formatError,
  formatGrades,
  formatPlanProposal,
  formatScheduleConfirmation,
  formatShiftConfirmation,
  formatStatusReport,
  formatUpdateConfirmation,
} from "../whatsapp/messageTemplates";

interface SessionTask {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
}

const DEFAULT_SCHEDULE_WINDOW_DAYS = 7;
const SHORT_DEADLINE_HOURS = 48;

function identifyStudentError() {
  const message = "Could not identify the student.";
  return { error: message, display: formatError(message) };
}

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
    const userId = toolContext?.state.get<string>("user_id");
    if (!userId) {
      return identifyStudentError();
    }
    const deadlineDate = new Date(deadline);

    // Reason about the student's existing committed study load and how much buffer is realistic,
    // so the planner can pace the new plan instead of treating every assignment in isolation.
    const scheduledRows = await db
      .select({
        estimatedMinutes: tasksTable.estimatedMinutes,
        scheduledStart: tasksTable.scheduledStart,
      })
      .from(tasksTable)
      .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "scheduled")));

    const existingLoadMinutes = scheduledRows
      .filter((row) => row.scheduledStart && row.scheduledStart < deadlineDate)
      .reduce((sum, row) => sum + row.estimatedMinutes, 0);

    const hoursUntilDeadline = (deadlineDate.getTime() - Date.now()) / (60 * 60 * 1000);
    const bufferDays = hoursUntilDeadline < SHORT_DEADLINE_HOURS ? 0 : 1;

    const breakdown = await generatePlan({
      assignment: { title, description: description ?? null, deadline: deadlineDate },
      constraints:
        sessionCount !== undefined || sessionMinutes !== undefined
          ? { taskCount: sessionCount, minutesPerTask: sessionMinutes, existingLoadMinutes, bufferDays }
          : { existingLoadMinutes, bufferDays },
    });

    const tasks: SessionTask[] = breakdown.tasks.map((task) => ({
      id: randomUUID(),
      title: task.title,
      description: task.description,
      estimatedMinutes: task.estimatedMinutes,
    }));

    // A student can only be negotiating one not-yet-confirmed plan at a time — superseding any
    // earlier unconfirmed proposal keeps exactly one "proposed" batch per user, which is what
    // lets reschedule_tasks/cancel_tasks find "the current plan" from Postgres alone, durably
    // across restarts and new conversations, without an ephemeral session-state pointer.
    await db
      .update(tasksTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "proposed")));

    const planBatchId = randomUUID();
    await db.insert(tasksTable).values(
      tasks.map((task) => ({
        id: task.id,
        userId,
        title: task.title,
        description: task.description,
        estimatedMinutes: task.estimatedMinutes,
        status: "proposed" as const,
        planBatchId,
      })),
    );

    return { tasks, display: formatPlanProposal(title, tasks) };
  },
});

export const rescheduleTasksTool = new FunctionTool({
  name: "reschedule_tasks",
  description:
    "Schedule the most recently proposed (not yet confirmed) study tasks into free calendar " +
    "slots. Call this when the user confirms a proposed plan or asks to schedule/plan out their " +
    "study tasks. Looks the proposal up in the database, so it works even in a new conversation.",
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
    const userId = toolContext?.state.get<string>("user_id");
    if (!userId) {
      return identifyStudentError();
    }

    const proposedRows = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "proposed")))
      .orderBy(desc(tasksTable.createdAt));

    if (proposedRows.length === 0) {
      const message = "There's no proposed plan to schedule yet — break down an assignment first.";
      return { error: message, display: formatError(message) };
    }

    const planBatchId = proposedRows[0]!.planBatchId;
    const tasks = proposedRows
      .filter((row) => row.planBatchId === planBatchId)
      .map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description ?? undefined,
        estimatedMinutes: row.estimatedMinutes,
      }));

    const start = rangeStart ? new Date(rangeStart) : new Date();
    const end = rangeEnd
      ? new Date(rangeEnd)
      : new Date(start.getTime() + DEFAULT_SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const result = await createSchedule(userId, { tasks, rangeStart: start, rangeEnd: end });

    const tasksById = new Map(tasks.map((t) => [t.id, t.title]));
    const scheduledWithTitles = result.scheduled.map((entry) => ({
      title: tasksById.get(entry.taskId) ?? "Study session",
      start: entry.start,
    }));

    return {
      ...result,
      display: formatScheduleConfirmation(scheduledWithTitles, result.unscheduled.length),
    };
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
      return identifyStudentError();
    }

    try {
      const assignments = await canvasClient.listAssignments(userId);
      return {
        assignments: assignments.map((a) => ({
          title: a.title,
          pointsPossible: a.pointsPossible,
          deadline: a.deadline.toISOString(),
        })),
        display: formatAssignmentList(assignments),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch assignments from Canvas.";
      return { error: message, display: formatError(message) };
    }
  },
});

export const getAssignmentDetailTool = new FunctionTool({
  name: "get_assignment_detail",
  description:
    "Look up full detail (description, points possible, deadline) for one Canvas assignment by " +
    "title, for questions about what an assignment actually covers or requires — beyond what " +
    "get_open_assignments already returns.",
  parameters: z.object({
    title: z.string().describe("The assignment's title, or close to it."),
  }),
  async execute({ title }, toolContext) {
    const userId = toolContext?.state.get<string>("user_id");
    if (!userId) {
      return identifyStudentError();
    }

    let assignments;
    try {
      assignments = await canvasClient.listAssignments(userId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch assignments from Canvas.";
      return { error: message, display: formatError(message) };
    }

    const needle = title.toLowerCase();
    const matches = assignments.filter((a) => a.title.toLowerCase().includes(needle));

    if (matches.length === 0) {
      const message = `No open assignment matching "${title}" was found.`;
      return { error: message, display: formatError(message) };
    }
    if (matches.length > 1) {
      const message = `Multiple open assignments match "${title}": ${matches.map((m) => m.title).join(", ")}. Ask which one.`;
      return { error: message, display: formatError(message) };
    }

    const assignment = matches[0]!;
    return {
      title: assignment.title,
      description: assignment.description,
      pointsPossible: assignment.pointsPossible,
      deadline: assignment.deadline.toISOString(),
    };
  },
});

export const getStudyStatusTool = new FunctionTool({
  name: "get_study_status",
  description:
    "Report the student's current study plan status: what's scheduled, completed, and still " +
    'pending. Call this for questions like "what\'s left", "what do I have today/this week", ' +
    'or "how am I doing on my plan" — this is about the study plan, not Canvas grades (for ' +
    "grades use get_grades instead).",
  parameters: z.object({
    scope: z
      .enum(["today", "week", "all"])
      .optional()
      .describe(
        "Time window for the scheduled-sessions list: today, week (next 7 days), or all. " +
          "Defaults to week.",
      ),
  }),
  async execute({ scope }, toolContext) {
    const userId = toolContext?.state.get<string>("user_id");
    if (!userId) {
      return identifyStudentError();
    }

    const effectiveScope = scope ?? "week";
    const now = new Date();
    const windowEnd =
      effectiveScope === "today"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        : effectiveScope === "week"
          ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          : undefined;

    const rows = await db.select().from(tasksTable).where(eq(tasksTable.userId, userId));

    const scheduledRows = rows.filter(
      (t) =>
        t.status === "scheduled" &&
        t.scheduledStart &&
        t.scheduledStart >= now &&
        (!windowEnd || t.scheduledStart < windowEnd),
    );
    const completedCount = rows.filter((t) => t.status === "completed").length;
    const pendingCount = rows.filter((t) => t.status === "pending").length;
    const proposedCount = rows.filter((t) => t.status === "proposed").length;
    const scopeLabel =
      effectiveScope === "today" ? "today" : effectiveScope === "week" ? "this week" : "overall";

    return {
      scope: effectiveScope,
      scheduled: scheduledRows.map((t) => ({
        title: t.title,
        start: t.scheduledStart!.toISOString(),
      })),
      completed: completedCount,
      pending: pendingCount,
      awaitingConfirmation: proposedCount,
      display: formatStatusReport(
        scopeLabel,
        scheduledRows.map((t) => ({ title: t.title, start: t.scheduledStart! })),
        completedCount,
        pendingCount,
        proposedCount,
      ),
    };
  },
});

export const shiftUpcomingSessionsTool = new FunctionTool({
  name: "shift_upcoming_sessions",
  description:
    "Shift all of the student's upcoming scheduled study sessions by a fixed offset — for life " +
    'events like being sick or traveling ("push everything back a day"). Moves both the database ' +
    "record and the real calendar event for each affected session. For editing a single named " +
    "session instead, use update_study_session.",
  parameters: z.object({
    afterDate: z
      .string()
      .optional()
      .describe(
        "ISO 8601 cutoff — only sessions starting at or after this are shifted. Defaults to now.",
      ),
    shiftDays: z
      .number()
      .int()
      .optional()
      .describe("Days to shift by (can be negative). Combine with shiftHours if needed."),
    shiftHours: z.number().int().optional().describe("Hours to shift by (can be negative)."),
  }),
  async execute({ afterDate, shiftDays, shiftHours }, toolContext) {
    const userId = toolContext?.state.get<string>("user_id");
    if (!userId) {
      return identifyStudentError();
    }
    if (!shiftDays && !shiftHours) {
      const message = "Specify how much to shift by (e.g. shiftDays or shiftHours).";
      return { error: message, display: formatError(message) };
    }

    const cutoff = afterDate ? new Date(afterDate) : new Date();
    const offsetMs = (shiftDays ?? 0) * 24 * 60 * 60 * 1000 + (shiftHours ?? 0) * 60 * 60 * 1000;

    const rows = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "scheduled")));

    const affected = rows.filter((t) => t.scheduledStart && t.scheduledStart >= cutoff);

    await Promise.all(
      affected.map(async (task) => {
        const newStart = new Date(task.scheduledStart!.getTime() + offsetMs);
        const newEnd = new Date(task.scheduledEnd!.getTime() + offsetMs);

        if (task.googleEventId) {
          await calendarClient.updateEvent(userId, task.googleEventId, {
            start: newStart,
            end: newEnd,
          });
        }

        await db
          .update(tasksTable)
          .set({ scheduledStart: newStart, scheduledEnd: newEnd, updatedAt: new Date() })
          .where(eq(tasksTable.id, task.id));
      }),
    );

    return { shiftedCount: affected.length, display: formatShiftConfirmation(affected.length) };
  },
});

export const getGradesTool = new FunctionTool({
  name: "get_grades",
  description:
    "Fetch the student's current grades across all active Canvas courses. Call this for " +
    'questions like "how did I do", "grades", "how am I doing in X", "worst/best course", or ' +
    '"average".',
  async execute(_input, toolContext) {
    const userId = toolContext?.state.get<string>("user_id");
    if (!userId) {
      return identifyStudentError();
    }

    try {
      const grades = await canvasClient.listGrades(userId);
      return { grades, display: formatGrades(grades) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch grades from Canvas.";
      return { error: message, display: formatError(message) };
    }
  },
});

export const cancelTasksTool = new FunctionTool({
  name: "cancel_tasks",
  description:
    "Cancel the student's current plan — whichever is most recent, whether it's a proposal not " +
    "yet scheduled or a plan already on the calendar — deleting any calendar events already " +
    "created. Call this when the user asks to cancel or drop their current plan. Looks the plan " +
    "up in the database, so it works even in a new conversation.",
  async execute(_input, toolContext) {
    const userId = toolContext?.state.get<string>("user_id");
    if (!userId) {
      return identifyStudentError();
    }

    const activeRows = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, userId),
          inArray(tasksTable.status, ["proposed", "scheduled"]),
          isNotNull(tasksTable.planBatchId),
        ),
      )
      .orderBy(desc(tasksTable.createdAt));

    if (activeRows.length === 0) {
      return { cancelled: false, display: formatCancelConfirmation(false, 0) };
    }

    // "The current plan" is the most recently created batch — a student can be actively working
    // with several older, already-scheduled plans they simply haven't cancelled, and cancel_tasks
    // (like the old ephemeral "current_schedule" it replaces) only ever means the latest one.
    const planBatchId = activeRows[0]!.planBatchId;
    const batchRows = activeRows.filter((row) => row.planBatchId === planBatchId);
    const scheduledRows = batchRows.filter(
      (row) => row.status === "scheduled" && row.googleEventId,
    );

    await Promise.all(
      scheduledRows.map((row) => calendarClient.deleteEvent(userId, row.googleEventId!)),
    );

    await db
      .update(tasksTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        inArray(
          tasksTable.id,
          batchRows.map((row) => row.id),
        ),
      );

    return {
      cancelled: true,
      display: formatCancelConfirmation(true, scheduledRows.length),
    };
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
      return identifyStudentError();
    }
    if (newDescription === undefined && newStart === undefined) {
      const message = "Nothing to update — specify a new description and/or a new time.";
      return { error: message, display: formatError(message) };
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
      const message = `No scheduled session matching "${title}" was found.`;
      return { error: message, display: formatError(message) };
    }
    if (matches.length > 1) {
      const message = `Multiple scheduled sessions match "${title}": ${matches.map((m) => m.title).join(", ")}. Ask which one.`;
      return { error: message, display: formatError(message) };
    }

    const task = matches[0]!;
    if (!task.googleEventId) {
      const message = "This session has no linked calendar event to update.";
      return { error: message, display: formatError(message) };
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
        updatedAt: new Date(),
      })
      .where(eq(tasksTable.id, task.id));

    const changedFields = [
      ...(newDescription !== undefined ? ["the description"] : []),
      ...(newStartDate ? ["the time"] : []),
    ];

    return {
      updated: true,
      title: task.title,
      display: formatUpdateConfirmation(task.title, changedFields),
    };
  },
});
