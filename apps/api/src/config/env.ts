import { z } from "zod";

const EnvSchema = z.object({
  // app
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3001),
  // IANA timezone used to format dates/times in WhatsApp message templates. Stopgap until
  // per-student timezone preferences exist.
  DEFAULT_TIMEZONE: z.string().default("UTC"),

  // Google
  GEMINI_API_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),

  // WhatsApp
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().default(""),
  WHATSAPP_API_VERSION: z.string().default("v23.0"),
});

export const env = EnvSchema.parse(process.env);
