import { Router } from "express";
import { z } from "zod";
import { DEMO_USER_ID } from "../lib/demoUser";
import { canvasClient } from "./mockCanvasClient";

export const canvasRouter = Router();

export const CanvasConnectSchema = z.object({
  userId: z.string().default(DEMO_USER_ID),
  canvasBaseUrl: z.string(),
  apiToken: z.string(),
});

canvasRouter.post("/connect", async (req, res) => {
  const body = CanvasConnectSchema.parse(req.body ?? {});
  await canvasClient.connect(body.userId, body.canvasBaseUrl, body.apiToken);
  res.status(201).json({ connected: true });
});

canvasRouter.post("/disconnect", async (req, res) => {
  const body = z.object({ userId: z.string().default(DEMO_USER_ID) }).parse(req.body ?? {});
  await canvasClient.disconnect(body.userId);
  res.json({ connected: false });
});

canvasRouter.get("/assignments", async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : DEMO_USER_ID;
  const assignments = await canvasClient.listAssignments(userId);
  res.json({ assignments });
});

canvasRouter.post("/sync", async (req, res) => {
  const body = z.object({ userId: z.string().default(DEMO_USER_ID) }).parse(req.body ?? {});
  const assignments = await canvasClient.listAssignments(body.userId);
  res.json({ synced: assignments.length, assignments });
});
