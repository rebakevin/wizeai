import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  PORT: z.coerce.number().int().positive().default(3001),
});

export const env = EnvSchema.parse(process.env);
