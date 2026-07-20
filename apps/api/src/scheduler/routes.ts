import { Router } from "express";
import { ScheduleCreateInputSchema } from "@wizeai/shared/schemas";
import { z } from "zod";
import { DEMO_USER_ID } from "../lib/demoUser";
import { createSchedule, reschedule } from "./schedulerService";

export const schedulerRouter = Router();

export const ScheduleRequestSchema = z
  .object({ userId: z.string().default(DEMO_USER_ID) })
  .and(ScheduleCreateInputSchema);

schedulerRouter.post("/create", async (req, res) => {
  const body = ScheduleRequestSchema.parse(req.body ?? {});
  const result = await createSchedule(body.userId, body);
  res.status(201).json(result);
});

schedulerRouter.post("/reschedule", async (req, res) => {
  const body = ScheduleRequestSchema.parse(req.body ?? {});
  const result = await reschedule(body.userId, body);
  res.json(result);
});
