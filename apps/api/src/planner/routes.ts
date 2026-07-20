import { Router } from "express";
import { PlannerGenerateInputSchema } from "@wizeai/shared";
import { z } from "zod";
import { generate, generateAndPersist } from "./plannerService";

export const plannerRouter = Router();

export const PlannerGenerateRequestSchema = PlannerGenerateInputSchema.extend({
  assignmentId: z.string().optional(),
});

plannerRouter.post("/generate", async (req, res) => {
  const body = PlannerGenerateRequestSchema.parse(req.body);
  const breakdown = body.assignmentId
    ? await generateAndPersist(body.assignmentId, { assignment: body.assignment })
    : await generate({ assignment: body.assignment });

  res.status(201).json(breakdown);
});
