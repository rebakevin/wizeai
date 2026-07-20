import type { z } from "zod";
import type {
  AssignmentSchema,
  AssignmentStatusSchema,
  CalendarEventSchema,
  CanvasConnectionSchema,
  GoogleConnectionSchema,
  TaskSchema,
  TaskStatusSchema,
  UserSchema,
  WhatsappConnectionSchema,
} from "../schemas/entities";
import type {
  PlannerGenerateInputSchema,
  TaskBreakdownItemSchema,
  TaskBreakdownSchema,
} from "../schemas/planner";
import type {
  BusyBlockSchema,
  FreeSlotSchema,
  ScheduleCreateInputSchema,
  ScheduledTaskSchema,
  ScheduleResultSchema,
} from "../schemas/scheduler";

export type User = z.infer<typeof UserSchema>;
export type CanvasConnection = z.infer<typeof CanvasConnectionSchema>;
export type GoogleConnection = z.infer<typeof GoogleConnectionSchema>;
export type WhatsappConnection = z.infer<typeof WhatsappConnectionSchema>;
export type Assignment = z.infer<typeof AssignmentSchema>;
export type AssignmentStatus = z.infer<typeof AssignmentStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export type PlannerGenerateInput = z.infer<typeof PlannerGenerateInputSchema>;
export type TaskBreakdownItem = z.infer<typeof TaskBreakdownItemSchema>;
export type TaskBreakdown = z.infer<typeof TaskBreakdownSchema>;

export type BusyBlock = z.infer<typeof BusyBlockSchema>;
export type FreeSlot = z.infer<typeof FreeSlotSchema>;
export type ScheduleCreateInput = z.infer<typeof ScheduleCreateInputSchema>;
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>;
export type ScheduleResult = z.infer<typeof ScheduleResultSchema>;
