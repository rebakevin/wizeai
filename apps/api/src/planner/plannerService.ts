import { randomUUID } from "node:crypto";
import { InMemoryRunner, isFinalResponse, stringifyContent } from "@google/adk";
import { TaskBreakdownSchema, type PlannerGenerateInput, type TaskBreakdown } from "@wizeai/shared";
import { db } from "../db/client";
import { tasks } from "../db/schema";
import { plannerAgent } from "./agent";

const runner = new InMemoryRunner({ agent: plannerAgent, appName: "wizeai-planner" });

function buildPrompt(input: PlannerGenerateInput): string {
  const { title, description, deadline } = input.assignment;
  const lines = [
    `Assignment title: ${title}`,
    `Description: ${description ?? "(none provided)"}`,
    `Deadline: ${deadline.toISOString()}`,
  ];

  const { taskCount, minutesPerTask, existingLoadMinutes, bufferDays } = input.constraints ?? {};
  if (taskCount !== undefined) {
    lines.push(`Produce exactly ${taskCount} tasks.`);
  }
  if (minutesPerTask !== undefined) {
    lines.push(`Each task's estimatedMinutes should be ${minutesPerTask}.`);
  }
  if (existingLoadMinutes !== undefined && existingLoadMinutes > 0) {
    lines.push(
      `The student already has ${existingLoadMinutes} minutes of other study sessions scheduled ` +
        "before this deadline — avoid overloading further; keep total new study time proportionate.",
    );
  }
  if (bufferDays !== undefined && bufferDays > 0) {
    lines.push(
      `Leave at least ${bufferDays} day(s) of buffer before the deadline for review — the last ` +
        "task shouldn't be substantial new work due right at the deadline itself.",
    );
  }

  return lines.join("\n");
}

export async function generate(input: PlannerGenerateInput): Promise<TaskBreakdown> {
  const events = runner.runEphemeral({
    userId: "planner-service",
    newMessage: { role: "user", parts: [{ text: buildPrompt(input) }] },
  });

  let finalText = "";
  for await (const event of events) {
    if (isFinalResponse(event)) {
      finalText = stringifyContent(event);
    }
  }

  if (!finalText) {
    throw new Error("Planner agent did not return a final response");
  }

  return TaskBreakdownSchema.parse(JSON.parse(finalText));
}

export async function generateAndPersist(
  assignmentId: string,
  userId: string,
  input: PlannerGenerateInput,
): Promise<TaskBreakdown> {
  const breakdown = await generate(input);

  await db.insert(tasks).values(
    breakdown.tasks.map((task) => ({
      id: randomUUID(),
      userId,
      assignmentId,
      title: task.title,
      description: task.description,
      estimatedMinutes: task.estimatedMinutes,
    })),
  );

  return breakdown;
}
