import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once on first access.
 *
 * Validation is lazy (not at import time) so that `next build` can run
 * without production secrets present; any code path that actually needs a
 * variable fails fast with a clear message listing what is missing.
 */
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, "must be a mongodb:// or mongodb+srv:// URI"),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  APP_URL: z.url().transform((u) => u.replace(/\/+$/, "")),
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(587),
  ),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
  MAIL_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Bearer token required by /api/cron/* (Vercel Cron sends it automatically). */
  CRON_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().min(16, "must be at least 16 characters").optional(),
  ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables:\n${problems}\n` +
        "See .env.example for the required settings.",
    );
  }
  return result.data;
}

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** True when outgoing email is fully configured. */
export function isEmailConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.MAIL_FROM);
}
