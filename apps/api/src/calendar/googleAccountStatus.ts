import { and, eq } from "drizzle-orm";
import { GOOGLE_CALENDAR_SCOPE } from "@wizeai/shared";
import { db } from "../db/client";
import { accounts } from "../db/schema";

export async function isCalendarConnected(userId: string): Promise<boolean> {
  const [account] = await db
    .select({ scope: accounts.scope })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")))
    .limit(1);

  return account?.scope?.includes(GOOGLE_CALENDAR_SCOPE) ?? false;
}
