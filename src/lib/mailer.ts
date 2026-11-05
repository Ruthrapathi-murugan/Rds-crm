import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getServerEnv, isEmailConfigured, type ServerEnv } from "@/lib/env";

export type MailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

export type MailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
};

export type SendMailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: "not_configured" | "failed" };

let cached: { key: string; transporter: Transporter } | undefined;

function transporterFor(env: ServerEnv): Transporter {
  // Re-create only when the SMTP settings change (e.g. between tests).
  const key = [env.SMTP_HOST, env.SMTP_PORT, env.SMTP_USER, env.SMTP_PASSWORD].join("\u0000");
  if (cached?.key === key) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Port 465 uses implicit TLS; other ports upgrade with STARTTLS.
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  cached = { key, transporter };
  return transporter;
}

/**
 * Sends an email through the configured SMTP server. Never throws: callers
 * get `{ sent: false }` when email is not configured or delivery fails, so
 * a mail problem never breaks the action that triggered it. Credentials and
 * message bodies are never logged.
 */
export async function sendMail(message: MailMessage): Promise<SendMailResult> {
  let env: ServerEnv;
  try {
    env = getServerEnv();
  } catch {
    return { sent: false, reason: "not_configured" };
  }
  if (!isEmailConfigured(env)) return { sent: false, reason: "not_configured" };

  try {
    const info = await transporterFor(env).sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments,
    });
    return { sent: true, messageId: String(info.messageId ?? "") };
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    console.error(`[mail] delivery failed${typeof code === "string" ? ` (${code})` : ""}`);
    return { sent: false, reason: "failed" };
  }
}
