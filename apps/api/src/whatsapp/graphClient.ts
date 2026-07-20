import { env } from "../config/env";

interface GraphErrorResponse {
  error?: { message?: string; type?: string; code?: number };
}

export async function sendText(to: string, body: string): Promise<{ messageId: string }> {
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as GraphErrorResponse;
    throw new Error(
      `WhatsApp send failed (${res.status}): ${errorBody.error?.message ?? res.statusText}`,
    );
  }

  const data = (await res.json()) as { messages?: { id: string }[] };
  return { messageId: data.messages?.[0]?.id ?? "" };
}
