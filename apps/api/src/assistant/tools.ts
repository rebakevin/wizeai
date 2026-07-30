import { randomUUID } from "node:crypto";
import { FunctionTool } from "@google/adk";
import { z } from "zod";
import { canvasClient } from "../canvas/realCanvasClient";
import { generate as generatePlan } from "../planner/plannerService";
import { createSchedule } from "../scheduler/schedulerService";

interface SessionTask {
  id: string;
  title: string;
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
  }),
  async execute({ title, description, deadline }, toolContext) {
    const breakdown = await generatePlan({
      assignment: { title, description: description ?? null, deadline: new Date(deadline) },
    });

    const tasks: SessionTask[] = breakdown.tasks.map((task) => ({
      id: randomUUID(),
      title: task.title,
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
    "Cancel the current task breakdown and any schedule made from it. " +
    "Call this when the user asks to cancel or drop their current plan.",
  async execute(_input, toolContext) {
    const hadTasks = Boolean(toolContext?.state.get("current_tasks"));
    toolContext?.state.set("current_tasks", undefined);
    toolContext?.state.set("current_schedule", undefined);
    return { cancelled: hadTasks };
  },
});
