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
          estimatedMinutes: {
            type: Type.INTEGER,
            description: "Realistic time estimate for a student to finish this task, in minutes.",
          },
        },
        required: ["title", "estimatedMinutes"],
      },
    },
  },
  required: ["tasks"],
};
