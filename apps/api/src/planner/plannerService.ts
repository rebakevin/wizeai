import { randomUUID } from "node:crypto";
import { InMemoryRunner, isFinalResponse, stringifyContent } from "@google/adk";
import { TaskBreakdownSchema, type PlannerGenerateInput, type TaskBreakdown } from "@wizeai/shared";
import { db } from "../db/client";
import { tasks } from "../db/schema";
import { plannerAgent } from "./agent";

const runner = new InMemoryRunner({ agent: plannerAgent, appName: "wizeai-planner" });

function buildPrompt(input: PlannerGenerateInput): string {
  const { title, description, deadline } = input.assignment;
  return [
    `Assignment title: ${title}`,
    `Description: ${description ?? "(none provided)"}`,
    `Deadline: ${deadline.toISOString()}`,
  ].join("\n");
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
  input: PlannerGenerateInput,
): Promise<TaskBreakdown> {
  const breakdown = await generate(input);

  await db.insert(tasks).values(
    breakdown.tasks.map((task) => ({
      id: randomUUID(),
      assignmentId,
      title: task.title,
      estimatedMinutes: task.estimatedMinutes,
    })),
  );

  return breakdown;
}
