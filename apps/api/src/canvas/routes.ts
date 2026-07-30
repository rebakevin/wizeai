import { Router } from "express";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth";
import { DEMO_USER_ID } from "../lib/demoUser";
import { canvasClient } from "./realCanvasClient";

export const canvasRouter = Router();

export const CanvasConnectSchema = z.object({
  canvasBaseUrl: z.string(),
  apiToken: z.string(),
});

canvasRouter.post("/connect", async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const body = CanvasConnectSchema.parse(req.body ?? {});
  try {
    await canvasClient.connect(session.user.id, body.canvasBaseUrl, body.apiToken);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to connect to Canvas" });
    return;
  }
  res.status(201).json({ connected: true });
});

canvasRouter.post("/disconnect", async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  await canvasClient.disconnect(session.user.id);
  res.json({ connected: false });
});

canvasRouter.get("/status", async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({ connected: await canvasClient.isConnected(session.user.id) });
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
