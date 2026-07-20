import { Router } from "express";
import { z } from "zod";
import { DEMO_USER_ID } from "../lib/demoUser";
import { chat } from "./assistantService";

export const assistantRouter = Router();

export const ChatRequestSchema = z.object({
  userId: z.string().default(DEMO_USER_ID),
  message: z.string().min(1),
});

assistantRouter.post("/chat", async (req, res) => {
  const body = ChatRequestSchema.parse(req.body);
  const reply = await chat(body.userId, body.message);
  res.json({ reply });
});
