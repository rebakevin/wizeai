import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { whatsappConnections } from "../db/schema";

// Meta's inbound wa_id arrives as digits-only with no "+" (e.g. "15551234567"), while the
// Connect WhatsApp web form's placeholder implies a "+"-prefixed number — normalize both to
// digits-only before storing/comparing so they actually match.
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function findUserIdByPhoneNumber(phoneNumber: string): Promise<string | null> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const [connection] = await db
    .select({ userId: whatsappConnections.userId })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.phoneNumber, normalized))
    .limit(1);

  return connection?.userId ?? null;
}
