import { LlmAgent } from "@google/adk";
import { TASK_BREAKDOWN_OUTPUT_KEY, taskBreakdownAdkSchema } from "./schema";

export const plannerAgent = new LlmAgent({
  name: "assignment_planner",
  model: "gemini-flash-latest",
  description: "Breaks a student assignment down into concrete, time-boxed study tasks.",
  instruction: `You are an assignment planning assistant for a student.
Given an assignment's title, description, and deadline, break it into a short
sequence of concrete tasks a student can complete in individual study sessions.
Each task needs a short actionable title and a realistic estimatedMinutes
(typically between 15 and 120). Prefer 3-6 tasks. Respond ONLY with JSON
matching the required schema — no extra commentary.`,
  outputSchema: taskBreakdownAdkSchema,
  outputKey: TASK_BREAKDOWN_OUTPUT_KEY,
});
