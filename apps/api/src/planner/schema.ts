import { Type, type Schema } from "@google/genai";

export const TASK_BREAKDOWN_OUTPUT_KEY = "task_breakdown";

export const taskBreakdownAdkSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Short, concrete task title." },
          description: {
            type: Type.STRING,
            description:
              "A work-ticket-style description of the session: 2-4 short sentences or lines " +
              "telling the student exactly what to do and what 'done' looks like. Plain text, " +
              "no markdown — this goes straight into a Google Calendar event description.",
          },
          estimatedMinutes: {
            type: Type.INTEGER,
            description: "Realistic time estimate for a student to finish this task, in minutes.",
          },
        },
        required: ["title", "description", "estimatedMinutes"],
      },
    },
  },
  required: ["tasks"],
};
