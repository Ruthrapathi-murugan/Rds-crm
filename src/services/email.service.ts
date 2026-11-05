import "server-only";
import type { Types } from "mongoose";
import type { EntityType } from "@/lib/constants";
import type { EmailWithSubject } from "@/lib/email-templates";
import { sendMail, type MailAttachment, type SendMailResult } from "@/lib/mailer";
import { connectToDatabase } from "@/lib/mongodb";
import { EmailLogModel } from "@/models/email-log";

export type DeliverEmailInput = {
  /** Template key stored in the log, e.g. "password_reset_otp". */
  template: string;
  to: string | string[];
  message: EmailWithSubject;
  attachments?: MailAttachment[];
  related?: { entityType: EntityType; entityId: Types.ObjectId | string };
  sentBy?: Types.ObjectId | string;
};

/**
 * Sends an email and records the outcome in the email log. Like `sendMail`,
 * it never throws — a mail or logging problem never breaks the caller.
 * Message bodies are not logged.
 */
export async function deliverEmail(input: DeliverEmailInput): Promise<SendMailResult> {
  const result = await sendMail({
    to: input.to,
    subject: input.message.subject,
    html: input.message.html,
    text: input.message.text,
    attachments: input.attachments,
  });

  try {
    await connectToDatabase();
    await EmailLogModel.create({
      to: Array.isArray(input.to) ? input.to.join(", ") : input.to,
      subject: input.message.subject,
      template: input.template,
      status: result.sent ? "sent" : result.reason,
      messageId: result.sent ? result.messageId : undefined,
      entityType: input.related?.entityType,
      entityId: input.related?.entityId,
      sentBy: input.sentBy,
    });
  } catch (error) {
    console.error("[email-log] failed to write entry:", error instanceof Error ? error.message : error);
  }
  return result;
}
