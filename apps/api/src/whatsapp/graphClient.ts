import { env } from "../config/env";

interface GraphErrorResponse {
  error?: { message?: string; type?: string; code?: number };
}

async function postMessages(payload: unknown): Promise<Response> {
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as GraphErrorResponse;
    throw new Error(
      `WhatsApp API call failed (${res.status}): ${errorBody.error?.message ?? res.statusText}`,
    );
  }

  return res;
}

export async function sendText(to: string, body: string): Promise<{ messageId: string }> {
  const res = await postMessages({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });

  const data = (await res.json()) as { messages?: { id: string }[] };
  return { messageId: data.messages?.[0]?.id ?? "" };
}

export async function sendReadReceiptAndTyping(messageId: string): Promise<void> {
  await postMessages({
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
    typing_indicator: { type: "text" },
  });
}
