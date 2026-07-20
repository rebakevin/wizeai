import { db } from "../db/client";
import { users } from "../db/schema";

// Stub integrations (Canvas/Calendar/WhatsApp) aren't wired to real Better Auth
// sessions yet, so every mock route operates against one seeded demo user.
export const DEMO_USER_ID = "demo-user";

export async function ensureDemoUser(): Promise<void> {
  await db
    .insert(users)
    .values({
      id: DEMO_USER_ID,
      email: "demo@wizeai.dev",
      name: "Demo Student",
    })
    .onConflictDoNothing();
}
