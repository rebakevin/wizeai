import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { whatsappConnections } from "../db/schema";
import type { WhatsappClient } from "./whatsappClient";

export class MockWhatsappClient implements WhatsappClient {
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

  async sendMessage(userId: string, text: string): Promise<{ messageId: string }> {
    const messageId = randomUUID();
    console.log(`[mock-whatsapp] -> user ${userId}: ${text} (messageId=${messageId})`);
    return { messageId };
  }

  async receiveWebhook(payload: unknown): Promise<void> {
    console.log("[mock-whatsapp] webhook payload received:", JSON.stringify(payload));
  }

  verifyWebhook(mode: string, _token: string, challenge: string): string | null {
    return mode === "subscribe" ? challenge : null;
  }
}

export const whatsappClient: WhatsappClient = new MockWhatsappClient();
