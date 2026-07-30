import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { whatsappConnections } from "../db/schema";
import { chat } from "../assistant/assistantService";
import { sendReadReceiptAndTyping, sendText } from "./graphClient";
import { chunkForWhatsapp } from "./messageFormat";
import { enqueue, markSeen } from "./inboundQueue";
import { findUserIdByPhoneNumber, normalizePhoneNumber } from "./phoneNumber";
import type { WhatsappClient } from "./whatsappClient";

const STALE_MESSAGE_MS = 5 * 60 * 1000;
const NON_TEXT_REPLY = "I can only read text messages right now — mind typing it out?";
const CHAT_FAILURE_REPLY = "Sorry — something went wrong on my end. Mind sending that again?";
const UNLINKED_SENDER_REPLY =
  "I don't recognize this number yet — connect it to your account in the Wize AI app first " +
  "(Account → Connect WhatsApp), then message me again.";

const WebhookPayloadSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                messages: z
                  .array(
                    z.object({
                      from: z.string(),
                      type: z.string(),
                      id: z.string().optional(),
                      timestamp: z.string().optional(),
                      text: z.object({ body: z.string() }).optional(),
                    }),
                  )
                  .optional(),
                statuses: z
                  .array(
                    z.object({
                      status: z.string(),
                      errors: z
                        .array(
                          z.object({
                            title: z.string().optional(),
                            message: z.string().optional(),
                          }),
                        )
                        .optional(),
                    }),
                  )
                  .optional(),
              }),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export class RealWhatsappClient implements WhatsappClient {
  async connect(userId: string, phoneNumber: string): Promise<void> {
    const normalized = normalizePhoneNumber(phoneNumber);
    await db
      .insert(whatsappConnections)
      .values({ id: randomUUID(), userId, phoneNumber: normalized })
      .onConflictDoUpdate({
        target: whatsappConnections.userId,
        set: { phoneNumber: normalized },
      });
  }

  async disconnect(userId: string): Promise<void> {
    await db.delete(whatsappConnections).where(eq(whatsappConnections.userId, userId));
  }

  async isConnected(userId: string): Promise<boolean> {
    const [connection] = await db
      .select({ id: whatsappConnections.id })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.userId, userId))
      .limit(1);
    return connection !== undefined;
  }

  async sendMessage(to: string, text: string): Promise<{ messageId: string }> {
    return sendText(to, text);
  }

  async receiveWebhook(payload: unknown): Promise<void> {
    const parsed = WebhookPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("[whatsapp] unrecognized webhook payload:", JSON.stringify(payload));
      return;
    }

    const changes = (parsed.data.entry ?? []).flatMap((entry) => entry.changes ?? []);
    const messages = changes.flatMap((change) => change.value.messages ?? []);
    const statuses = changes.flatMap((change) => change.value.statuses ?? []);

    console.log(
      `[whatsapp] inbound: ${messages.length} message(s), ${statuses.length} status(es)`,
    );

    for (const status of statuses) {
      if (status.status === "failed") {
        console.error("[whatsapp] delivery failed:", JSON.stringify(status.errors));
      }
    }

    for (const message of messages) {
      if (message.id && !markSeen(message.id)) {
        console.log(`[whatsapp] skipping duplicate delivery of ${message.id}`);
        continue;
      }

      if (message.timestamp) {
        const ageMs = Date.now() - Number(message.timestamp) * 1000;
        if (ageMs > STALE_MESSAGE_MS) {
          console.log(`[whatsapp] skipping stale message from ${message.from} (${ageMs}ms old)`);
          continue;
        }
      }

      if (message.type !== "text" || !message.text) {
        enqueue(message.from, async () => {
          await this.sendMessage(message.from, NON_TEXT_REPLY);
        });
        continue;
      }

      const body = message.text.body;
      console.log(`[whatsapp] received message from ${message.from}: ${JSON.stringify(body)}`);

      enqueue(message.from, async () => {
        if (message.id) {
          sendReadReceiptAndTyping(message.id).catch((err: unknown) => {
            console.warn(`[whatsapp] failed to send read receipt/typing indicator:`, err);
          });
        }

        const userId = await findUserIdByPhoneNumber(message.from);
        if (!userId) {
          console.log(`[whatsapp] no linked account for ${message.from}`);
          await this.sendMessage(message.from, UNLINKED_SENDER_REPLY);
          return;
        }

        let reply: string;
        try {
          console.log(`[whatsapp] calling assistant for ${message.from} (user ${userId})`);
          reply = await chat(userId, body);
          console.log(`[whatsapp] assistant replied to ${message.from}: ${JSON.stringify(reply)}`);
        } catch (err) {
          console.error(`[whatsapp] chat() failed for ${message.from} (user ${userId}):`, err);
          reply = CHAT_FAILURE_REPLY;
        }

        try {
          for (const chunk of chunkForWhatsapp(reply)) {
            await this.sendMessage(message.from, chunk);
          }
        } catch (err) {
          console.error(`[whatsapp] failed to send reply to ${message.from}:`, err);
        }
      });
    }
  }

  verifyWebhook(mode: string, _token: string, challenge: string): string | null {
    return mode === "subscribe" ? challenge : null;
  }
}

export const whatsappClient: WhatsappClient = new RealWhatsappClient();
