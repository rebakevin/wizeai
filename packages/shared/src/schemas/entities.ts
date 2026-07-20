import { z } from "zod";

export const AssignmentStatusSchema = z.enum(["pending", "in_progress", "completed"]);
export const TaskStatusSchema = z.enum(["pending", "scheduled", "completed"]);

export const UserSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const CanvasConnectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  canvasBaseUrl: z.string(),
  accessToken: z.string(),
  createdAt: z.coerce.date(),
});

export const GoogleConnectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const WhatsappConnectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  phoneNumber: z.string(),
  createdAt: z.coerce.date(),
});

export const AssignmentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  canvasId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  deadline: z.coerce.date(),
  status: AssignmentStatusSchema,
  createdAt: z.coerce.date(),
});

export const TaskSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  title: z.string(),
  estimatedMinutes: z.number().int().positive(),
  scheduledStart: z.coerce.date().nullable(),
  scheduledEnd: z.coerce.date().nullable(),
  status: TaskStatusSchema,
  createdAt: z.coerce.date(),
});

export const CalendarEventSchema = z.object({
  id: z.string(),
  userId: z.string(),
  taskId: z.string().nullable(),
  googleEventId: z.string().nullable(),
  title: z.string(),
  start: z.coerce.date(),
  end: z.coerce.date(),
  createdAt: z.coerce.date(),
});
