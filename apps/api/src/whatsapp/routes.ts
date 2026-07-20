import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { DEMO_USER_ID } from "../lib/demoUser";
import { whatsappClient } from "./realWhatsappClient";

export const whatsappRouter = Router();

export const WhatsappConnectSchema = z.object({
  userId: z.string().default(DEMO_USER_ID),
  phoneNumber: z.string(),
});

export const WhatsappSendSchema = z.object({
  to: z.string(),
  text: z.string().min(1),
});

let warnedNoAppSecret = false;

function isValidSignature(req: Request): boolean {
  if (!env.WHATSAPP_APP_SECRET) {
    if (!warnedNoAppSecret) {
      console.warn(
        "[whatsapp] WHATSAPP_APP_SECRET is not set — skipping webhook signature verification.",
      );
      warnedNoAppSecret = true;
    }
    return true;
  }

  const signatureHeader = req.header("x-hub-signature-256");
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!signatureHeader || !rawBody) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex")}`;
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}

whatsappRouter.post("/connect", async (req, res) => {
  const body = WhatsappConnectSchema.parse(req.body ?? {});
  await whatsappClient.connect(body.userId, body.phoneNumber);
  res.status(201).json({ connected: true });
});

whatsappRouter.get("/webhook", (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");

  if (token !== env.WHATSAPP_VERIFY_TOKEN) {
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

whatsappRouter.post("/webhook", (req, res) => {
  if (!isValidSignature(req)) {
    res.sendStatus(403);
    return;
  }

  // Meta expects a fast ack; the agent call can take several seconds, so we
  // process the payload after responding rather than awaiting it here.
  res.sendStatus(200);

  whatsappClient.receiveWebhook(req.body).catch((err: unknown) => {
    console.error("[whatsapp] webhook processing failed:", err);
  });
});

whatsappRouter.post("/send", async (req, res) => {
  const body = WhatsappSendSchema.parse(req.body);
  const result = await whatsappClient.sendMessage(body.to, body.text);
  res.status(201).json(result);
});
