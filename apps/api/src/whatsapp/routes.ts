import { Router } from "express";
import { z } from "zod";
import { DEMO_USER_ID } from "../lib/demoUser";
import { whatsappClient } from "./mockWhatsappClient";

export const whatsappRouter = Router();

const WEBHOOK_VERIFY_TOKEN = "wizeai-dev-verify-token";

export const WhatsappConnectSchema = z.object({
  userId: z.string().default(DEMO_USER_ID),
  phoneNumber: z.string(),
});

whatsappRouter.post("/connect", async (req, res) => {
  const body = WhatsappConnectSchema.parse(req.body ?? {});
  await whatsappClient.connect(body.userId, body.phoneNumber);
  res.status(201).json({ connected: true });
});

whatsappRouter.get("/webhook", (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");

  if (token !== WEBHOOK_VERIFY_TOKEN) {
    res.sendStatus(403);
    return;
  }

  const result = whatsappClient.verifyWebhook(mode, token, challenge);
  if (result === null) {
    res.sendStatus(403);
    return;
  }
  res.status(200).send(result);
});

whatsappRouter.post("/webhook", async (req, res) => {
  await whatsappClient.receiveWebhook(req.body);
  res.sendStatus(200);
});
