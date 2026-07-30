import { z } from "zod";

export const PlannerGenerateInputSchema = z.object({
  assignment: z.object({
    title: z.string(),
    description: z.string().nullable(),
    deadline: z.coerce.date(),
  }),
  constraints: z
    .object({
      taskCount: z.number().int().positive().optional(),
      minutesPerTask: z.number().int().positive().optional(),
    })
    .optional(),
});

export const TaskBreakdownItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  estimatedMinutes: z.number().int().positive(),
});

export const TaskBreakdownSchema = z.object({
  tasks: z.array(TaskBreakdownItemSchema).min(1),
});
