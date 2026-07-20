export interface WhatsappClient {
  connect(userId: string, phoneNumber: string): Promise<void>;
  disconnect(userId: string): Promise<void>;
  sendMessage(userId: string, text: string): Promise<{ messageId: string }>;
  receiveWebhook(payload: unknown): Promise<void>;
  verifyWebhook(mode: string, token: string, challenge: string): string | null;
}
