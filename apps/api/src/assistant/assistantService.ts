import { InMemorySessionService, Runner, isFinalResponse, stringifyContent } from "@google/adk";
import { assistantAgent } from "./agent";

const APP_NAME = "wize-assistant";

const sessionService = new InMemorySessionService();
const runner = new Runner({ appName: APP_NAME, agent: assistantAgent, sessionService });

export async function chat(userId: string, message: string): Promise<string> {
  const session = await sessionService.getOrCreateSession({
    appName: APP_NAME,
    userId,
    sessionId: userId,
    state: { user_id: userId },
  });

  const events = runner.runAsync({
    userId,
    sessionId: session.id,
    newMessage: { role: "user", parts: [{ text: message }] },
  });

  let reply = "";
  for await (const event of events) {
    if (isFinalResponse(event)) {
      reply = stringifyContent(event);
    }
  }

  if (!reply) {
    throw new Error("Assistant agent did not return a final response");
  }

  return reply;
}
