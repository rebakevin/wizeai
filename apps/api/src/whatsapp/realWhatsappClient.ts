import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { whatsappConnections } from "../db/schema";
import { chat } from "../assistant/assistantService";
import { sendText } from "./graphClient";
import type { WhatsappClient } from "./whatsappClient";

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
                      text: z.object({ body: z.string() }).optional(),
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
    await db.insert(whatsappConnections).values({
      id: randomUUID(),
      userId,
      phoneNumber,
    });
  }

  async disconnect(userId: string): Promise<void> {
    await db.delete(whatsappConnections).where(eq(whatsappConnections.userId, userId));
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

    const messages = (parsed.data.entry ?? []).flatMap((entry) =>
      (entry.changes ?? []).flatMap((change) => change.value.messages ?? []),
    );

    for (const message of messages) {
      if (message.type !== "text" || !message.text) {
        continue;
      }

      try {
        const reply = await chat(message.from, message.text.body);
        await this.sendMessage(message.from, reply);
      } catch (err) {
        console.error(`[whatsapp] failed to handle message from ${message.from}:`, err);
      }
    }
  }

  verifyWebhook(mode: string, _token: string, challenge: string): string | null {
    return mode === "subscribe" ? challenge : null;
  }
}

export const whatsappClient: WhatsappClient = new RealWhatsappClient();
